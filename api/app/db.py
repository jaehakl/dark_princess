from __future__ import annotations

from typing import List, Optional

from sqlalchemy import ForeignKey, Integer, JSON, MetaData, Text, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from settings import settings


DB_URL = settings.db_url
if DB_URL.startswith("sqlite:///"):
    DB_URL = DB_URL.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
if not DB_URL.startswith("sqlite+aiosqlite:///"):
    raise ValueError("DB_URL must use sqlite+aiosqlite:/// for SQLite-backed tables.")

engine = create_async_engine(
    DB_URL,
    future=True,
    echo=False,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine.sync_engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


async def get_db():
    async with SessionLocal() as db:
        try:
            yield db
        except Exception:
            await db.rollback()
            raise


naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=naming_convention)


class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_object_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scribble_object_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pose_object_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    positive_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    positive_prompt_embedding: Mapped[Optional[List[float]]] = mapped_column(JSON, nullable=True, deferred=True)
    negative_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seed_image_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("images.id", ondelete="SET NULL"),
        nullable=True,
    )
    model_parameters: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    cuts: Mapped[List["Cut"]] = relationship("Cut", back_populates="image")


class Cut(Base):
    __tablename__ = "cuts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("images.id", ondelete="SET NULL"),
        nullable=True,
    )
    embedding: Mapped[Optional[List[float]]] = mapped_column(JSON, nullable=True)
    script: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status_change: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    prompt_situation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt_hero: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt_camera: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt_negative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    image: Mapped[Optional["Image"]] = relationship(
        "Image",
        back_populates="cuts",
        lazy="selectin",
    )

    @property
    def image_url(self) -> Optional[str]:
        return self.image.image_object_key if self.image is not None else None

    @property
    def scribble_url(self) -> Optional[str]:
        return self.image.scribble_object_key if self.image is not None else None

    @property
    def pose_url(self) -> Optional[str]:
        return self.image.pose_object_key if self.image is not None else None


class SelectionModel(Base):
    __tablename__ = "selection_models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    file_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    statuses: Mapped[List["Status"]] = relationship("Status", back_populates="selection_model")


class Status(Base):
    __tablename__ = "statuses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    selection_model_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("selection_models.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    turn: Mapped[int] = mapped_column(Integer, nullable=False)
    cash: Mapped[int] = mapped_column(Integer, nullable=False)
    strength: Mapped[int] = mapped_column(Integer, nullable=False)
    agility: Mapped[int] = mapped_column(Integer, nullable=False)
    intelligence: Mapped[int] = mapped_column(Integer, nullable=False)
    sense: Mapped[int] = mapped_column(Integer, nullable=False)
    attractiveness: Mapped[int] = mapped_column(Integer, nullable=False)
    toughness: Mapped[int] = mapped_column(Integer, nullable=False)
    stress: Mapped[int] = mapped_column(Integer, nullable=False)
    context_embedding: Mapped[Optional[List[float]]] = mapped_column(JSON, nullable=True)

    selection_model: Mapped[Optional["SelectionModel"]] = relationship(
        "SelectionModel",
        back_populates="statuses",
    )
