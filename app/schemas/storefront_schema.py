from decimal import Decimal

from pydantic import BaseModel, Field


class StorefrontVariantRead(BaseModel):
    stock_id: int
    color_name: str | None
    color_hex: str | None
    size_label: str | None
    quantity: int


class StorefrontProductRead(BaseModel):
    id: int
    name: str
    description: str | None
    # None when the admin marked this product's price as hidden on the
    # storefront (`Product.price_hidden_from_storefront`) — the storefront
    # then shows "Consultar precio" instead of a number.
    price: Decimal | None
    image_url: str | None
    # Extra gallery photos (`ProductImage`, beyond the cover `image_url`),
    # for the storefront's product-detail page thumbnail strip.
    gallery_urls: list[str]
    category_name: str | None
    variants: list[StorefrontVariantRead]
    in_stock: bool


class CartPreviewItem(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class CartPreviewRequest(BaseModel):
    items: list[CartPreviewItem] = Field(min_length=1)


class AppliedPromotionRead(BaseModel):
    promotion_id: int
    name: str
    discount_amount: Decimal


class CartPreviewResponse(BaseModel):
    subtotal: Decimal
    promotion_discount: Decimal
    total: Decimal
    applied_promotions: list[AppliedPromotionRead]
