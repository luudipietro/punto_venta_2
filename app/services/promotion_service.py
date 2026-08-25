from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleViolationError, EntityNotFoundError
from app.domain.promotion import DiscountType, Promotion
from app.domain.promotion_item import PromotionItem
from app.infrastructure.db.session import get_db
from app.repositories.category_repository import CategoryRepository, SqlAlchemyCategoryRepository
from app.repositories.product_repository import ProductRepository, SqlAlchemyProductRepository
from app.repositories.promotion_item_repository import (
    PromotionItemRepository,
    SqlAlchemyPromotionItemRepository,
)
from app.repositories.promotion_repository import PromotionRepository, SqlAlchemyPromotionRepository
from app.services.base_service import CrudService

_CENTS = Decimal("0.01")


def compute_line_discount(
    discount_type: DiscountType, discount_value: Decimal, unit_price: Decimal, quantity: int
) -> Decimal:
    line_subtotal = unit_price * quantity
    if discount_type == DiscountType.PERCENTAGE:
        raw_discount = line_subtotal * discount_value / Decimal("100")
    else:
        raw_discount = min(discount_value * quantity, line_subtotal)
    return raw_discount.quantize(_CENTS, rounding=ROUND_HALF_UP)


@dataclass(slots=True)
class PromotionApplication:
    """A resolved, winning discount to apply to a specific product in a sale.
    Not a domain entity - a computation result produced by
    `PromotionService.select_winning_applications` and consumed by `SaleService`."""

    promotion_id: int
    product_id: int
    quantity: int
    discount_amount: Decimal


@dataclass(slots=True)
class _Candidate:
    promotion_id: int
    applications: list[PromotionApplication]
    matched_products: set[int]
    total_discount: Decimal


class _UnionFind:
    def __init__(self, ids: list[int]) -> None:
        self._parent = {i: i for i in ids}

    def find(self, x: int) -> int:
        while self._parent[x] != x:
            self._parent[x] = self._parent[self._parent[x]]
            x = self._parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        root_a, root_b = self.find(a), self.find(b)
        if root_a != root_b:
            self._parent[root_b] = root_a


class PromotionService(CrudService[Promotion]):
    entity_name = "Promotion"

    def __init__(
        self,
        repository: PromotionRepository,
        promotion_item_repository: PromotionItemRepository,
        product_repository: ProductRepository,
        category_repository: CategoryRepository,
    ) -> None:
        super().__init__(repository)
        self._promotion_item_repository = promotion_item_repository
        self._product_repository = product_repository
        self._category_repository = category_repository

    async def create(self, promotion: Promotion, items: list[PromotionItem]) -> Promotion:
        await self._validate_items(items)
        created = await super().create(promotion)
        for item in items:
            item.promotion_id = created.id
            new_item = await self._promotion_item_repository.create(item)
            item.id = new_item.id
        return created

    async def update(
        self, entity_id: int, promotion: Promotion, items: list[PromotionItem]
    ) -> Promotion:
        """Replaces all of the promotion's items with the given list (full
        replace, not a partial patch)."""
        await self._validate_items(items)
        updated = await super().update(entity_id, promotion)
        await self._promotion_item_repository.delete_by_promotion(entity_id)
        for item in items:
            item.promotion_id = entity_id
            new_item = await self._promotion_item_repository.create(item)
            item.id = new_item.id
        return updated

    async def get_items(self, promotion_id: int) -> list[PromotionItem]:
        return await self._promotion_item_repository.list_by_promotion(promotion_id)

    async def select_winning_applications(
        self,
        cart_quantities: dict[int, int],
        cart_categories: dict[int, int],
        cart_unit_prices: dict[int, Decimal],
        on_date: date,
    ) -> list[PromotionApplication]:
        """Picks, for each cluster of promotions that compete over overlapping
        cart products, the single promotion with the greatest total discount
        amount among those whose item conditions are fully satisfied by the
        cart. Promotions targeting disjoint sets of products can all win at
        once. See CLAUDE.md for the full algorithm description."""
        candidates = await self._collect_satisfied_candidates(
            cart_quantities, cart_categories, cart_unit_prices, on_date
        )
        if not candidates:
            return []

        union_find = _UnionFind([candidate.promotion_id for candidate in candidates])
        for i in range(len(candidates)):
            for j in range(i + 1, len(candidates)):
                if candidates[i].matched_products & candidates[j].matched_products:
                    union_find.union(candidates[i].promotion_id, candidates[j].promotion_id)

        groups: dict[int, list[_Candidate]] = {}
        for candidate in candidates:
            root = union_find.find(candidate.promotion_id)
            groups.setdefault(root, []).append(candidate)

        applications: list[PromotionApplication] = []
        for group in groups.values():
            winner = max(group, key=lambda c: (c.total_discount, -c.promotion_id))
            applications.extend(winner.applications)

        applications.sort(key=lambda a: (a.promotion_id, a.product_id))
        return applications

    async def _collect_satisfied_candidates(
        self,
        cart_quantities: dict[int, int],
        cart_categories: dict[int, int],
        cart_unit_prices: dict[int, Decimal],
        on_date: date,
    ) -> list[_Candidate]:
        candidates: list[_Candidate] = []
        for promotion in await self._repository.list_active(on_date):
            lines = await self._promotion_item_repository.list_by_promotion(promotion.id)
            if not lines:
                continue

            remaining = dict(cart_quantities)
            matched: list[tuple[int, PromotionItem, int]] = []
            satisfied = True
            for line in lines:
                target_product_id = self._resolve_line_target(line, remaining, cart_categories)
                available = remaining.get(target_product_id, 0) if target_product_id else 0
                if target_product_id is None or available < line.min_quantity:
                    satisfied = False
                    break
                remaining[target_product_id] -= available
                matched.append((target_product_id, line, available))

            if not satisfied:
                continue

            # A promotion with 2+ lines is a combo: it can trigger multiple
            # times if the cart holds multiple complete sets (e.g. 2 shirts +
            # 2 shorts triggers a "1 shirt + 1 short" combo twice, discounting
            # both; 2 shirts + 1 short triggers it once, leaving the second
            # shirt full price). A single-line promotion keeps the old
            # behavior — min_quantity there is just a threshold gate ("10% off
            # if you buy 3+"), not a combo unit, so it still discounts
            # everything matched rather than only multiples of min_quantity.
            repeat_count = (
                min(available // line.min_quantity for _, line, available in matched)
                if len(lines) >= 2
                else None
            )

            applications: list[PromotionApplication] = []
            total_discount = Decimal("0")
            for product_id, line, available in matched:
                if repeat_count is None:
                    effective_quantity = (
                        min(line.max_quantity, available)
                        if line.max_quantity is not None
                        else available
                    )
                else:
                    uncapped = line.min_quantity * repeat_count
                    capped = (
                        line.max_quantity * repeat_count
                        if line.max_quantity is not None
                        else uncapped
                    )
                    effective_quantity = min(available, uncapped, capped)

                unit_price = cart_unit_prices.get(product_id, Decimal("0"))
                discount = compute_line_discount(
                    line.discount_type, line.discount_value, unit_price, effective_quantity
                )
                total_discount += discount
                applications.append(
                    PromotionApplication(
                        promotion_id=promotion.id,
                        product_id=product_id,
                        quantity=effective_quantity,
                        discount_amount=discount,
                    )
                )

            candidates.append(
                _Candidate(
                    promotion_id=promotion.id,
                    applications=applications,
                    matched_products={product_id for product_id, _, _ in matched},
                    total_discount=total_discount,
                )
            )
        return candidates

    @staticmethod
    def _resolve_line_target(
        line: PromotionItem, remaining: dict[int, int], cart_categories: dict[int, int]
    ) -> int | None:
        if line.product_id is not None:
            return line.product_id
        for product_id, category_id in cart_categories.items():
            if category_id != line.category_id:
                continue
            if remaining.get(product_id, 0) >= line.min_quantity:
                return product_id
        return None

    async def _validate_items(self, items: list[PromotionItem]) -> None:
        if not items:
            raise BusinessRuleViolationError("La promoción debe tener al menos un ítem")
        for item in items:
            if (item.product_id is None) == (item.category_id is None):
                raise BusinessRuleViolationError(
                    "Cada ítem de la promoción debe apuntar a un producto o a una "
                    "categoría, no ambos"
                )
            if item.product_id is not None:
                if await self._product_repository.get_by_id(item.product_id) is None:
                    raise EntityNotFoundError("Product", item.product_id)
            if item.category_id is not None:
                if await self._category_repository.get_by_id(item.category_id) is None:
                    raise EntityNotFoundError("Category", item.category_id)


def get_promotion_service(session: AsyncSession = Depends(get_db)) -> PromotionService:
    return PromotionService(
        SqlAlchemyPromotionRepository(session),
        SqlAlchemyPromotionItemRepository(session),
        SqlAlchemyProductRepository(session),
        SqlAlchemyCategoryRepository(session),
    )
