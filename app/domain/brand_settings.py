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
    id: int = 1
