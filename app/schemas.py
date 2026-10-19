from pydantic import BaseModel


class ScanIn(BaseModel):
    code: str
    move: bool = False   # person already on another task: True = move them to this task


class BadgeIn(BaseModel):
    badge: str


class RemarkIn(BaseModel):
    remark: str


class KpiIn(BaseModel):
    name: str
    value: str
