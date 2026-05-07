from __future__ import annotations

from typing import List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, MetaData, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from settings import settings


def make_async_db_url(url: str) -> str:
    if not url:
        return url
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


DB_URL = make_async_db_url(settings.db_url)
engine = create_async_engine(DB_URL, future=True, pool_pre_ping=True, echo=False)
SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=naming_convention)


class TimestampMixin:
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Tag(TimestampMixin, Base):
    __tablename__ = "tags"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)

    status_tags: Mapped[List["StatusTag"]] = relationship("StatusTag", back_populates="tag", cascade="all, delete-orphan")
    target_status_tags: Mapped[List["TargetStatusTag"]] = relationship("TargetStatusTag", back_populates="tag", cascade="all, delete-orphan")


class Scene(TimestampMixin, Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    triggers: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    options: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    results: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    image: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    scene_histories: Mapped[List["SceneHistory"]] = relationship("SceneHistory", back_populates="scene", cascade="all, delete-orphan")


class Status(TimestampMixin, Base):
    __tablename__ = "statuses"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    turn: Mapped[int] = mapped_column(Integer, nullable=False)
    cash: Mapped[int] = mapped_column(Integer, nullable=False)
    strength: Mapped[int] = mapped_column(Integer, nullable=False)
    agility: Mapped[int] = mapped_column(Integer, nullable=False)
    intelligence: Mapped[int] = mapped_column(Integer, nullable=False)
    sense: Mapped[int] = mapped_column(Integer, nullable=False)
    attractiveness: Mapped[int] = mapped_column(Integer, nullable=False)
    toughness: Mapped[int] = mapped_column(Integer, nullable=False)
    stress: Mapped[int] = mapped_column(Integer, nullable=False)

    status_tags: Mapped[List["StatusTag"]] = relationship("StatusTag", back_populates="status", cascade="all, delete-orphan")
    scene_histories: Mapped[List["SceneHistory"]] = relationship("SceneHistory", back_populates="status", cascade="all, delete-orphan")
    target_statuses: Mapped[List["TargetStatus"]] = relationship("TargetStatus", back_populates="status", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_statuses_user_id", "user_id"),
        Index("uq_statuses_user_id_name", "user_id", "name", unique=True),
    )


class StatusTag(TimestampMixin, Base):
    __tablename__ = "status_tags"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status_id: Mapped[int] = mapped_column(Integer, ForeignKey("statuses.id", ondelete="CASCADE"), nullable=False)
    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)

    status: Mapped["Status"] = relationship("Status", back_populates="status_tags")
    tag: Mapped["Tag"] = relationship("Tag", back_populates="status_tags")

    __table_args__ = (
        Index("ix_status_tags_tag_id", "tag_id"),
        Index("uq_status_tags_status_id_tag_id", "status_id", "tag_id", unique=True),
    )


class SceneHistory(TimestampMixin, Base):
    __tablename__ = "scene_histories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status_id: Mapped[int] = mapped_column(Integer, ForeignKey("statuses.id", ondelete="CASCADE"), nullable=False)
    scene_id: Mapped[int] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False)
    turn: Mapped[int] = mapped_column(Integer, nullable=False)
    sub_turn: Mapped[int] = mapped_column(Integer, nullable=False)
    decisions: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    status: Mapped["Status"] = relationship("Status", back_populates="scene_histories")
    scene: Mapped["Scene"] = relationship("Scene", back_populates="scene_histories")

    __table_args__ = (
        Index("ix_scene_histories_scene_id", "scene_id"),
        Index("uq_scene_histories_status_id_turn_sub_turn", "status_id", "turn", "sub_turn", unique=True),
    )


class Target(TimestampMixin, Base):
    __tablename__ = "targets"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(Text, nullable=False)    
    name: Mapped[str] = mapped_column(Text, nullable=False)    
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    properties: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    image: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    target_statuses: Mapped[List["TargetStatus"]] = relationship("TargetStatus", back_populates="target", cascade="all, delete-orphan")


class TargetStatus(TimestampMixin, Base):
    __tablename__ = "target_statuses"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status_id: Mapped[int] = mapped_column(Integer, ForeignKey("statuses.id", ondelete="CASCADE"), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, ForeignKey("targets.id", ondelete="CASCADE"), nullable=False)
    interactions: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    status: Mapped["Status"] = relationship("Status", back_populates="target_statuses")
    target: Mapped["Target"] = relationship("Target", back_populates="target_statuses")
    target_status_tags: Mapped[List["TargetStatusTag"]] = relationship("TargetStatusTag", back_populates="target_status", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_target_statuses_status_id", "status_id"),
        Index("ix_target_statuses_target_id", "target_id"),
        Index("uq_target_statuses_status_id_target_id", "status_id", "target_id", unique=True),
    )


class TargetStatusTag(TimestampMixin, Base):
    __tablename__ = "target_status_tags"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    target_status_id: Mapped[int] = mapped_column(Integer, ForeignKey("target_statuses.id", ondelete="CASCADE"), nullable=False)
    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)

    target_status: Mapped["TargetStatus"] = relationship("TargetStatus", back_populates="target_status_tags")
    tag: Mapped["Tag"] = relationship("Tag", back_populates="target_status_tags")

    __table_args__ = (
        Index("ix_target_status_tags_tag_id", "tag_id"),
        Index("uq_target_status_tags_target_status_id_tag_id", "target_status_id", "tag_id", unique=True),
    )
