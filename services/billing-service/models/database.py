import os
from enum import Enum
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

# Helper para inyección de dependencias
async def get_db():
    async with async_session() as session:
        yield session
