from dataclasses import dataclass


@dataclass(slots=True)
class BrandSettings:
    company_name: str
    logo_url: str
    id: int = 1
