from pydantic import BaseModel, ConfigDict


class SizeBase(BaseModel):
    label: str


class SizeCreate(SizeBase):
    pass


class SizeRead(SizeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
