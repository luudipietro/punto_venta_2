from pydantic import BaseModel


class BrandColorSet(BaseModel):
    background: str
    foreground: str
    card: str
    card_foreground: str
    primary: str
    primary_foreground: str
    secondary: str
    secondary_foreground: str
    muted: str
    muted_foreground: str
    accent: str
    accent_foreground: str
    border: str
    ring: str


class BrandColors(BaseModel):
    light: BrandColorSet
    dark: BrandColorSet


class BrandSettingsUpdate(BaseModel):
    company_name: str
    logo_url: str
    colors: BrandColors | None = None
    whatsapp_number: str | None = None
    hero_images: list[str] | None = None


class BrandSettingsRead(BaseModel):
    company_name: str
    logo_url: str
    colors: BrandColors | None = None
    whatsapp_number: str | None = None
    hero_images: list[str] | None = None
