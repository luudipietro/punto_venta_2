from pydantic import BaseModel, ConfigDict


class ProductImageCreate(BaseModel):
    url: str


class ProductImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    url: str
