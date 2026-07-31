from pydantic import BaseModel, ConfigDict, Field


class StockBase(BaseModel):
    product_id: int
    color_id: int
    size_id: int
    branch_id: int
    quantity: int = Field(ge=0)


class StockCreate(StockBase):
    pass


class StockUpdate(StockBase):
    pass


class StockRead(StockBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class StockQuantityAdjustment(BaseModel):
    amount: int = Field(gt=0)
