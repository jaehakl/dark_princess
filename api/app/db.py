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


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    embedding: Mapped[Optional[List[float]]] = mapped_column(JSON, nullable=True)
    scripts: Mapped[dict | list] = mapped_column(JSON, nullable=False, default=list)
    status_change: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    scene_options: Mapped[List["SceneOption"]] = relationship(
        "SceneOption",
        back_populates="scene",
        cascade="all, delete-orphan",
    )


class SceneOption(Base):
    __tablename__ = "scene_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_id: Mapped[int] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False)
    option_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[List[float]]] = mapped_column(JSON, nullable=True)

    scene: Mapped["Scene"] = relationship("Scene", back_populates="scene_options")


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
