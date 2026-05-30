from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

class KegResponse(BaseModel):
    id: UUID
    name: str
    beer_style: Optional[str] = None
    capacity_ml: int
    remaining_ml: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TapResponse(BaseModel):
    id: UUID
    tap_code: str
    name: Optional[str] = None
    keg_id: Optional[UUID] = None
    price_per_ml: float
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class StockStatusResponse(BaseModel):
    tap_id: str  # represents tap_code (e.g. "tap-001")
    name: str
    keg_id: Optional[UUID] = None
    current_volume_ml: float
    percentage_left: float
    is_low_stock: bool

class KegCreate(BaseModel):
    name: str
    beer_style: Optional[str] = None
    capacity_ml: int = 25000
    remaining_ml: Optional[int] = None

class TapCreate(BaseModel):
    tap_code: str
    name: Optional[str] = None
    price_per_ml: float
    keg_id: Optional[UUID] = None

class TapUpdate(BaseModel):
    name: Optional[str] = None
    price_per_ml: Optional[float] = None
    keg_id: Optional[UUID] = None
    is_active: Optional[bool] = None


