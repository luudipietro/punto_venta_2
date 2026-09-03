from dataclasses import dataclass


@dataclass(slots=True)
class BrandSettings:
    company_name: str
    logo_url: str
    # {"light": {...}, "dark": {...}} of CSS color strings, or None to fall
    # back to the frontend's static brandConfig.colors defaults. Kept as a
    # plain dict rather than a nested dataclass — it's presentation data,
    # not a business invariant this layer needs to validate.
    colors: dict | None = None
    # E.164-ish digits only (e.g. "5491122334455"), no "+" — this is what
    # gets interpolated directly into a wa.me/<number> link on the storefront.
    whatsapp_number: str | None = None
    # Ordered list of media URLs for the storefront's home-page hero
    # carousel. Presentation data, not a business invariant — same reasoning
    # as `colors` above.
    hero_images: list[str] | None = None
    id: int = 1
