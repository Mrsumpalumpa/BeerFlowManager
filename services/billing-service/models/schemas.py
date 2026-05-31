from pydantic import BaseModel
from typing import Optional
from models.database import RoleEnum

class UserCreate(BaseModel):
    username: str
    password: str
    role: Optional[RoleEnum] = RoleEnum.CUSTOMER

class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[RoleEnum] = None

class UserResponse(BaseModel):
    id: int
    username: str
    role: RoleEnum

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
