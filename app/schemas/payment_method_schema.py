from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PaymentMethodBase(BaseModel):
    name: str
    surcharge_percentage: Decimal = Field(default=Decimal("0"), ge=0)
    is_cash: bool = False


class PaymentMethodCreate(PaymentMethodBase):
    pass


class PaymentMethodUpdate(PaymentMethodBase):
    pass


class PaymentMethodRead(PaymentMethodBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
