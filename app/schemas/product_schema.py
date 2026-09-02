from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ProductBase(BaseModel):
    name: str
    category_id: int | None = None
    brand_id: int | None = None
    cost: Decimal = Field(ge=0)
    price: Decimal = Field(ge=0)
    description: str | None = None
    image_url: str | None = None
    hidden_from_storefront: bool = False
    price_hidden_from_storefront: bool = False


class ProductCreate(ProductBase):
    pass


class ProductUpdate(ProductBase):
    pass


class ProductRead(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
