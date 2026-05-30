import os
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, ForeignKey, DateTime, Numeric
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://beerflow:beerflow_secret@localhost:5432/beerflow")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
Base = declarative_base()

class Keg(Base):
    __tablename__ = "kegs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    beer_style: Mapped[str | None] = mapped_column(String(100), nullable=True)
    capacity_ml: Mapped[int] = mapped_column(Integer, nullable=False, default=25000)
    remaining_ml: Mapped[int] = mapped_column(Integer, nullable=False, default=25000)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class Tap(Base):
    __tablename__ = "taps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tap_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    keg_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("kegs.id"), nullable=True)
    price_per_ml: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    keg: Mapped[Keg | None] = relationship("Keg", foreign_keys=[keg_id])

# Helper para inyección de dependencias
async def get_db():
    async with async_session() as session:
        yield session

