from pydantic import BaseModel, ConfigDict


class ColorBase(BaseModel):
    name: str


class ColorCreate(ColorBase):
    pass


class ColorUpdate(ColorBase):
    pass


class ColorRead(ColorBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
