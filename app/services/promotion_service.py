import logging
import math
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import Depends
from sqlalchemy.exc import IntegrityError
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
_MAX_SEARCH_SPACE = 100_000
logger = logging.getLogger(__name__)


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
class _CandidateTemplate:
    """One promotion's per-repeat unit economics: how much of each shared
    product ONE repeat consumes (reserves from the cart, blocking other
    promotions in the same cluster from also using it) versus how much of
    it ONE repeat actually discounts, and the dollar amount ONE repeat is
    worth. `_optimize_cluster` multiplies these by whatever repeat count
    (0..max_repeat) it decides to use for this candidate — each per-repeat
    discount is already quantized to the cent, so multiplying by an integer
    count stays exact, avoiding compounding rounding across chosen counts.
    A single-line (threshold, non-combo) promotion is modeled as
    `max_repeat = 1`: a binary "applies whole or not at all" choice, to
    preserve its existing all-or-nothing semantics."""

    promotion_id: int
    matched_products: set[int]
    per_repeat_consumption: dict[int, int] = field(default_factory=dict)
    per_repeat_discount_quantity: dict[int, int] = field(default_factory=dict)
    per_repeat_discount: dict[int, Decimal] = field(default_factory=dict)
    max_repeat: int = 0

    @property
    def discount_per_repeat(self) -> Decimal:
        return sum(self.per_repeat_discount.values(), Decimal("0"))


def _greedy_single_winner(templates: list[_CandidateTemplate]) -> dict[int, int]:
    """Fallback for a cluster whose search space is too large to explore
    exhaustively: reproduces the old "pick the single best candidate, apply
    it at its own maximal repeat count" behavior."""
    winner = max(templates, key=lambda t: (t.discount_per_repeat * t.max_repeat, -t.promotion_id))
    return {t.promotion_id: (t.max_repeat if t is winner else 0) for t in templates}


def _optimize_cluster(
    templates: list[_CandidateTemplate], cart_quantities: dict[int, int]
) -> dict[int, int]:
    """Chooses a repeat count (0..max_repeat) for each candidate promotion in
    a cluster of promotions competing over shared products, maximizing total
    discount without exceeding the cart's available quantity for any shared
    product. Exhaustive bounded backtracking — realistic POS input (a
    handful of active, overlapping promotions) keeps the search space tiny;
    a safety cap falls back to the old single-winner-per-cluster behavior
    for pathological inputs rather than risking a slow request."""
    search_space = math.prod(template.max_repeat + 1 for template in templates)
    if search_space > _MAX_SEARCH_SPACE:
        logger.warning(
            "Promotion cluster search space too large (%d combinations across %d "
            "candidates); falling back to single-winner selection",
            search_space,
            len(templates),
        )
        return _greedy_single_winner(templates)

    best_counts: dict[int, int] = {template.promotion_id: 0 for template in templates}
    best_total = Decimal("-1")

    def backtrack(
        index: int, remaining: dict[int, int], counts: dict[int, int], running_total: Decimal
    ) -> None:
        nonlocal best_counts, best_total
        if index == len(templates):
            if running_total > best_total:
                best_total = running_total
                best_counts = dict(counts)
            return

        template = templates[index]
        bounds = [template.max_repeat]
        for product_id, qty_per_repeat in template.per_repeat_consumption.items():
            if qty_per_repeat > 0:
                bounds.append(remaining.get(product_id, 0) // qty_per_repeat)
        max_possible = min(bounds)

        for count in range(max_possible, -1, -1):
            for product_id, qty_per_repeat in template.per_repeat_consumption.items():
                remaining[product_id] = remaining.get(product_id, 0) - qty_per_repeat * count
            counts[template.promotion_id] = count
            added = template.discount_per_repeat * count
            backtrack(index + 1, remaining, counts, running_total + added)
            for product_id, qty_per_repeat in template.per_repeat_consumption.items():
                remaining[product_id] = remaining.get(product_id, 0) + qty_per_repeat * count

        del counts[template.promotion_id]

    backtrack(0, dict(cart_quantities), {}, Decimal("0"))
    return best_counts


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

    async def delete(self, entity_id: int) -> None:
        await self.get_by_id(entity_id)
        await self._promotion_item_repository.delete_by_promotion(entity_id)
        try:
            await self._repository.delete(entity_id)
        except IntegrityError as exc:
            raise BusinessRuleViolationError(
                "No se puede eliminar: esta promoción tiene ventas asociadas"
            ) from exc

    async def select_winning_applications(
        self,
        cart_quantities: dict[int, int],
        cart_categories: dict[int, int],
        cart_unit_prices: dict[int, Decimal],
        on_date: date,
    ) -> list[PromotionApplication]:
        """For each cluster of promotions that compete over overlapping cart
        products (sharing at least one matched product), searches for the
        combination of repeat counts across those candidates that maximizes
        total discount without exceeding the cart's available quantity for
        any shared product — not just a single "winner" per cluster.
        Promotions targeting disjoint sets of products can all win at once,
        each at their own maximal repeat count. See CLAUDE.md for the full
        algorithm description."""
        templates = await self._collect_satisfied_candidates(
            cart_quantities, cart_categories, cart_unit_prices, on_date
        )
        if not templates:
            return []

        union_find = _UnionFind([template.promotion_id for template in templates])
        for i in range(len(templates)):
            for j in range(i + 1, len(templates)):
                if templates[i].matched_products & templates[j].matched_products:
                    union_find.union(templates[i].promotion_id, templates[j].promotion_id)

        groups: dict[int, list[_CandidateTemplate]] = {}
        for template in templates:
            root = union_find.find(template.promotion_id)
            groups.setdefault(root, []).append(template)

        applications: list[PromotionApplication] = []
        for group in groups.values():
            counts = _optimize_cluster(group, cart_quantities)
            for template in group:
                count = counts.get(template.promotion_id, 0)
                if count <= 0:
                    continue
                for product_id, discount in template.per_repeat_discount.items():
                    quantity = template.per_repeat_discount_quantity[product_id] * count
                    applications.append(
                        PromotionApplication(
                            promotion_id=template.promotion_id,
                            product_id=product_id,
                            quantity=quantity,
                            discount_amount=discount * count,
                        )
                    )

        applications.sort(key=lambda a: (a.promotion_id, a.product_id))
        return applications

    async def _collect_satisfied_candidates(
        self,
        cart_quantities: dict[int, int],
        cart_categories: dict[int, int],
        cart_unit_prices: dict[int, Decimal],
        on_date: date,
    ) -> list[_CandidateTemplate]:
        templates: list[_CandidateTemplate] = []
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
            is_combo = len(lines) >= 2

            template = _CandidateTemplate(
                promotion_id=promotion.id,
                matched_products={product_id for product_id, _, _ in matched},
            )

            if is_combo:
                template.max_repeat = min(
                    available // line.min_quantity for _, line, available in matched
                )
                for product_id, line, _available in matched:
                    discount_quantity_per_repeat = (
                        min(line.min_quantity, line.max_quantity)
                        if line.max_quantity is not None
                        else line.min_quantity
                    )
                    unit_price = cart_unit_prices.get(product_id, Decimal("0"))
                    template.per_repeat_consumption[product_id] = line.min_quantity
                    template.per_repeat_discount_quantity[product_id] = discount_quantity_per_repeat
                    template.per_repeat_discount[product_id] = compute_line_discount(
                        line.discount_type,
                        line.discount_value,
                        unit_price,
                        discount_quantity_per_repeat,
                    )
            else:
                template.max_repeat = 1
                for product_id, line, available in matched:
                    effective_quantity = (
                        min(line.max_quantity, available)
                        if line.max_quantity is not None
                        else available
                    )
                    unit_price = cart_unit_prices.get(product_id, Decimal("0"))
                    template.per_repeat_consumption[product_id] = available
                    template.per_repeat_discount_quantity[product_id] = effective_quantity
                    template.per_repeat_discount[product_id] = compute_line_discount(
                        line.discount_type, line.discount_value, unit_price, effective_quantity
                    )

            templates.append(template)
        return templates

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
