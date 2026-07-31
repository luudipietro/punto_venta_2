from pydantic import BaseModel, ConfigDict


class BranchBase(BaseModel):
    name: str


class BranchCreate(BranchBase):
    pass


class BranchUpdate(BranchBase):
    pass


class BranchRead(BranchBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
