import os
from enum import Enum
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base, Mapped, mapped_column

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://beerflow:beerflow_secret@localhost:5432/beerflow")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
Base = declarative_base()

class RoleEnum(str, Enum):
    ADMIN = "ADMIN"
    CUSTOMER = "CUSTOMER"

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(unique=True, index=True)
    password_hash: Mapped[str] = mapped_column()
    role: Mapped[RoleEnum] = mapped_column(default=RoleEnum.CUSTOMER)

class Consumption(Base):
    __tablename__ = "consumptions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(index=True)
    tap_id: Mapped[str] = mapped_column(index=True)
    keg_id: Mapped[str] = mapped_column(index=True)
    beer_style: Mapped[str] = mapped_column()
    ml_served: Mapped[float] = mapped_column()
    total_amount: Mapped[float] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

# Helper para inyección de dependencias
async def get_db():
    async with async_session() as session:
        yield session
