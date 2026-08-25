from pydantic import BaseModel


class BrandSettingsUpdate(BaseModel):
    company_name: str
    logo_url: str


class BrandSettingsRead(BaseModel):
    company_name: str
    logo_url: str
