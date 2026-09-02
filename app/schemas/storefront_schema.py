from decimal import Decimal

from pydantic import BaseModel


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
    category_name: str | None
    variants: list[StorefrontVariantRead]
    in_stock: bool
