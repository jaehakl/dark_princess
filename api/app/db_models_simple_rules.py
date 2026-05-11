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
    scope: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    system_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trigger_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    status_tags: Mapped[List["StatusTag"]] = relationship("StatusTag", back_populates="tag", cascade="all, delete-orphan")
    target_status_tags: Mapped[List["TargetStatusTag"]] = relationship("TargetStatusTag", back_populates="tag", cascade="all, delete-orphan")
    scene_conditions: Mapped[List["SceneCondition"]] = relationship("SceneCondition", back_populates="tag")
    scene_results: Mapped[List["SceneResult"]] = relationship("SceneResult", back_populates="tag")

    __table_args__ = (
        Index("ix_tags_system_key", "system_key"),
        Index("ix_tags_scope", "scope"),
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
    scene_conditions: Mapped[List["SceneCondition"]] = relationship("SceneCondition", back_populates="target")
    scene_results: Mapped[List["SceneResult"]] = relationship("SceneResult", back_populates="target")


class Scene(TimestampMixin, Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    repeat_policy: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'once_per_status'"))
    cooldown_turns: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    image: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    scene_histories: Mapped[List["SceneHistory"]] = relationship("SceneHistory", back_populates="scene", cascade="all, delete-orphan")
    trigger_blocks: Mapped[List["SceneTriggerBlock"]] = relationship("SceneTriggerBlock", back_populates="scene", cascade="all, delete-orphan")
    scene_options: Mapped[List["SceneOption"]] = relationship("SceneOption", back_populates="scene", cascade="all, delete-orphan", foreign_keys="SceneOption.scene_id")
    scene_results: Mapped[List["SceneResult"]] = relationship("SceneResult", back_populates="scene", cascade="all, delete-orphan")


class SceneTriggerBlock(TimestampMixin, Base):
    __tablename__ = "scene_trigger_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_id: Mapped[int] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    scene: Mapped["Scene"] = relationship("Scene", back_populates="trigger_blocks")
    conditions: Mapped[List["SceneCondition"]] = relationship("SceneCondition", back_populates="trigger_block", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_scene_trigger_blocks_scene_id", "scene_id"),
    )


class SceneOption(TimestampMixin, Base):
    __tablename__ = "scene_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_id: Mapped[int] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False)
    option_key: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_scene_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    scene: Mapped["Scene"] = relationship("Scene", back_populates="scene_options", foreign_keys=[scene_id])
    next_scene: Mapped[Optional["Scene"]] = relationship("Scene", foreign_keys=[next_scene_id])
    conditions: Mapped[List["SceneCondition"]] = relationship(
        "SceneCondition",
        back_populates="option",
        cascade="all, delete-orphan",
        foreign_keys="SceneCondition.option_id",
    )
    decisions: Mapped[List["SceneDecision"]] = relationship("SceneDecision", back_populates="option")

    __table_args__ = (
        Index("ix_scene_options_scene_id", "scene_id"),
        Index("uq_scene_options_scene_id_option_key", "scene_id", "option_key", unique=True),
    )


class SceneCondition(TimestampMixin, Base):
    __tablename__ = "scene_conditions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # trigger_block 조건이면 trigger_block_id 사용, option 표시 조건이면 option_id 사용
    trigger_block_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("scene_trigger_blocks.id", ondelete="CASCADE"), nullable=True)
    option_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("scene_options.id", ondelete="CASCADE"), nullable=True)

    kind: Mapped[str] = mapped_column(Text, nullable=False)
    operator: Mapped[str] = mapped_column(Text, nullable=False)

    tag_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=True)
    target_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("targets.id", ondelete="CASCADE"), nullable=True)
    scene_ref_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="CASCADE"), nullable=True)
    option_ref_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("scene_options.id", ondelete="SET NULL"), nullable=True)

    stat_field: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    numeric_value: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    value: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    trigger_block: Mapped[Optional["SceneTriggerBlock"]] = relationship("SceneTriggerBlock", back_populates="conditions")
    option: Mapped[Optional["SceneOption"]] = relationship("SceneOption", back_populates="conditions", foreign_keys=[option_id])
    option_ref: Mapped[Optional["SceneOption"]] = relationship("SceneOption", foreign_keys=[option_ref_id])
    tag: Mapped[Optional["Tag"]] = relationship("Tag", back_populates="scene_conditions")
    target: Mapped[Optional["Target"]] = relationship("Target", back_populates="scene_conditions")
    scene_ref: Mapped[Optional["Scene"]] = relationship("Scene", foreign_keys=[scene_ref_id])

    __table_args__ = (
        Index("ix_scene_conditions_trigger_block_id", "trigger_block_id"),
        Index("ix_scene_conditions_option_id", "option_id"),
        Index("ix_scene_conditions_kind", "kind"),
        Index("ix_scene_conditions_tag_id", "tag_id"),
        Index("ix_scene_conditions_target_id", "target_id"),
        Index("ix_scene_conditions_scene_ref_id", "scene_ref_id"),
        Index("ix_scene_conditions_option_ref_id", "option_ref_id"),
    )


class SceneResult(TimestampMixin, Base):
    __tablename__ = "scene_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    scene_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="CASCADE"), nullable=True)

    kind: Mapped[str] = mapped_column(Text, nullable=False)

    tag_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=True)
    target_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("targets.id", ondelete="CASCADE"), nullable=True)

    stat_field: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    numeric_value: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    value: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    scene: Mapped[Optional["Scene"]] = relationship("Scene", back_populates="scene_results")
    tag: Mapped[Optional["Tag"]] = relationship("Tag", back_populates="scene_results")
    target: Mapped[Optional["Target"]] = relationship("Target", back_populates="scene_results")
    applied_results: Mapped[List["SceneAppliedResult"]] = relationship("SceneAppliedResult", back_populates="result")

    __table_args__ = (
        Index("ix_scene_results_scene_id", "scene_id"),
        Index("ix_scene_results_kind", "kind"),
        Index("ix_scene_results_tag_id", "tag_id"),
        Index("ix_scene_results_target_id", "target_id"),
    )


class Status(TimestampMixin, Base):
    __tablename__ = "statuses"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    turn: Mapped[int] = mapped_column(Integer, nullable=False)
    sub_turn: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
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


class TargetStatus(TimestampMixin, Base):
    __tablename__ = "target_statuses"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status_id: Mapped[int] = mapped_column(Integer, ForeignKey("statuses.id", ondelete="CASCADE"), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, ForeignKey("targets.id", ondelete="CASCADE"), nullable=False)
    interactions: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    visitable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    status: Mapped["Status"] = relationship("Status", back_populates="target_statuses")
    target: Mapped["Target"] = relationship("Target", back_populates="target_statuses")
    target_status_tags: Mapped[List["TargetStatusTag"]] = relationship("TargetStatusTag", back_populates="target_status", cascade="all, delete-orphan")
    scene_histories: Mapped[List["SceneHistory"]] = relationship("SceneHistory", back_populates="target_status")

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




class SceneHistory(TimestampMixin, Base):
    __tablename__ = "scene_histories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status_id: Mapped[int] = mapped_column(Integer, ForeignKey("statuses.id", ondelete="CASCADE"), nullable=False)
    scene_id: Mapped[int] = mapped_column(Integer, ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False)
    target_status_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("target_statuses.id", ondelete="SET NULL"), nullable=True)
    turn: Mapped[int] = mapped_column(Integer, nullable=False)
    sub_turn: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped["Status"] = relationship("Status", back_populates="scene_histories")
    scene: Mapped["Scene"] = relationship("Scene", back_populates="scene_histories")
    target_status: Mapped[Optional["TargetStatus"]] = relationship("TargetStatus", back_populates="scene_histories")
    scene_decisions: Mapped[List["SceneDecision"]] = relationship("SceneDecision", back_populates="scene_history", cascade="all, delete-orphan")
    applied_results: Mapped[List["SceneAppliedResult"]] = relationship("SceneAppliedResult", back_populates="scene_history", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_scene_histories_scene_id", "scene_id"),
        Index("ix_scene_histories_target_status_id", "target_status_id"),
        Index("uq_scene_histories_status_id_turn_sub_turn", "status_id", "turn", "sub_turn", unique=True),
    )


class SceneDecision(TimestampMixin, Base):
    __tablename__ = "scene_decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_history_id: Mapped[int] = mapped_column(Integer, ForeignKey("scene_histories.id", ondelete="CASCADE"), nullable=False)
    option_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("scene_options.id", ondelete="SET NULL"), nullable=True)
    option_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    option_label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    value: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    scene_history: Mapped["SceneHistory"] = relationship("SceneHistory", back_populates="scene_decisions")
    option: Mapped[Optional["SceneOption"]] = relationship("SceneOption", back_populates="decisions")

    __table_args__ = (
        Index("ix_scene_decisions_scene_history_id", "scene_history_id"),
        Index("ix_scene_decisions_option_id", "option_id"),
    )


class SceneAppliedResult(TimestampMixin, Base):
    __tablename__ = "scene_applied_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_history_id: Mapped[int] = mapped_column(Integer, ForeignKey("scene_histories.id", ondelete="CASCADE"), nullable=False)
    result_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("scene_results.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    before: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    after: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    scene_history: Mapped["SceneHistory"] = relationship("SceneHistory", back_populates="applied_results")
    result: Mapped[Optional["SceneResult"]] = relationship("SceneResult", back_populates="applied_results")

    __table_args__ = (
        Index("ix_scene_applied_results_scene_history_id", "scene_history_id"),
        Index("ix_scene_applied_results_result_id", "result_id"),
    )
