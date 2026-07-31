from pydantic import BaseModel, ConfigDict


class BrandBase(BaseModel):
    name: str
    description: str | None = None


class BrandCreate(BrandBase):
    pass


class BrandUpdate(BrandBase):
    pass


class BrandRead(BrandBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
