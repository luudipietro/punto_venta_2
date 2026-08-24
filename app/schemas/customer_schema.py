from pydantic import BaseModel, ConfigDict


class CustomerBase(BaseModel):
    dni: str
    name: str


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(CustomerBase):
    pass


class CustomerRead(CustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
