from pydantic import BaseModel, ConfigDict


class ColorBase(BaseModel):
    name: str
    hex_code: str = "#000000"


class ColorCreate(ColorBase):
    pass


class ColorUpdate(ColorBase):
    pass


class ColorRead(ColorBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
