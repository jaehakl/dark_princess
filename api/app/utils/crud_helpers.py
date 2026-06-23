from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, Generic, List, Optional, TypeVar

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import Text, and_, cast, delete as sa_delete, func, inspect, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import Image as StoredImage
from models import GetListResponseBase, UpsertResponseBase
from utils.datetime_utils import db_datetime_to_utc, parse_api_datetime_to_utc
from utils.local_storage import (
    delete_object,
    object_key_from_public_url,
    public_file_url,
    public_file_url_from_reference,
)


ModelT = TypeVar("ModelT")
SchemaT = TypeVar("SchemaT", bound=BaseModel)


@dataclass(frozen=True)
class CrudSpec(Generic[ModelT, SchemaT]):
    model: type[ModelT]
    schema: type[SchemaT]
    relation_aliases: Mapping[str, str] = field(default_factory=dict)
    computed_fields: Mapping[str, tuple[tuple[str, ...], str]] = field(default_factory=dict)
    search_aliases: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    public_url_fields: tuple[str, ...] = field(default_factory=tuple)
    load_options: tuple[Any, ...] = field(default_factory=tuple)


FILE_REFERENCE_COLUMNS = (
    StoredImage.image_object_key,
    StoredImage.scribble_object_key,
    StoredImage.pose_object_key,
)


def computed(*path: str, attr: str = "id") -> tuple[tuple[str, ...], str]:
    return tuple(path), attr


def normalize_int_ids(values: Optional[Iterable[Any]], *, sort: bool = False) -> List[int]:
    normalized_ids: List[int] = []
    seen_ids: set[int] = set()

    for value in values or []:
        if not isinstance(value, int) or value in seen_ids:
            continue
        seen_ids.add(value)
        normalized_ids.append(value)

    return sorted(normalized_ids) if sort else normalized_ids


def _get_model_column_python_type(model: type[Any], field_name: str) -> Any | None:
    column = model.__table__.columns.get(field_name)
    if column is None:
        return None

    try:
        return column.type.python_type
    except (AttributeError, NotImplementedError):
        return None


def _normalize_payload_value(model: type[Any], field_name: str, value: Any) -> Any:
    if value is None:
        return None
    if _get_model_column_python_type(model, field_name) is datetime:
        return parse_api_datetime_to_utc(value)
    return value


def _normalize_public_url_field(field_name: str, value: Any) -> Any:
    if value in (None, ""):
        return value
    if not isinstance(value, str):
        return value

    object_key = object_key_from_public_url(value)
    if object_key is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be a local upload object key",
        )
    return object_key


def _get_relationship_attr(model: type[Any], attr_name: str) -> Any | None:
    relationship_attr = getattr(model, attr_name, None)
    if relationship_attr is None:
        return None

    relationship_property = getattr(relationship_attr, "property", None)
    if relationship_property is None or not hasattr(relationship_property, "mapper"):
        return None

    return relationship_attr


def _get_relation_attr_name(spec: CrudSpec[Any, Any], field_name: str) -> str | None:
    if field_name in spec.computed_fields:
        return None

    attr_name = spec.relation_aliases.get(field_name, field_name)
    if _get_relationship_attr(spec.model, attr_name) is None:
        return None

    return attr_name


def _get_relation_fields(spec: CrudSpec[Any, Any]) -> list[tuple[str, str, type[Any]]]:
    relation_fields: list[tuple[str, str, type[Any]]] = []
    for field_name in spec.schema.model_fields:
        attr_name = _get_relation_attr_name(spec, field_name)
        if attr_name is None:
            continue

        relationship_attr = _get_relationship_attr(spec.model, attr_name)
        if relationship_attr is None:
            continue

        relation_fields.append((field_name, attr_name, relationship_attr.property.mapper.class_))

    return relation_fields


def _build_load_options(
    model: type[Any],
    paths: Iterable[tuple[str, ...]],
) -> tuple[Any, ...]:
    unique_paths = {path for path in paths if path}
    compressed_paths = sorted(
        (
            path
            for path in unique_paths
            if not any(
                len(other_path) > len(path) and other_path[: len(path)] == path
                for other_path in unique_paths
            )
        ),
        key=lambda path: (len(path), path),
    )

    load_options = []
    for path in compressed_paths:
        current_model = model
        current_load = None
        for attr_name in path:
            relationship_attr = getattr(current_model, attr_name)
            current_load = (
                selectinload(relationship_attr)
                if current_load is None
                else current_load.selectinload(relationship_attr)
            )
            current_model = relationship_attr.property.mapper.class_
        if current_load is not None:
            load_options.append(current_load)

    return tuple(load_options)


async def cleanup_orphaned_object_keys(
    db: AsyncSession,
    object_values: Sequence[str | None],
) -> None:
    reference_values_by_key: dict[str, set[str]] = {}
    for value in {item for item in object_values if item}:
        object_key = object_key_from_public_url(value)
        if object_key is None:
            continue

        reference_values_by_key.setdefault(object_key, set()).update(
            {value, object_key, public_file_url(object_key)}
        )

    for object_key, reference_values in reference_values_by_key.items():
        is_referenced = False
        for column in FILE_REFERENCE_COLUMNS:
            stmt = select(func.count()).select_from(column.class_).where(column.in_(reference_values))
            if (await db.execute(stmt)).scalar_one():
                is_referenced = True
                break
        if not is_referenced:
            delete_object(object_key)


async def get_list_response(
    db: AsyncSession,
    request: Any,
    spec: CrudSpec[ModelT, SchemaT],
    base_clause: Any | None = None,
) -> GetListResponseBase:
    def _get_column_python_type(field_name: str) -> Any | None:
        return _get_model_column_python_type(spec.model, field_name)

    def _combine_clauses(combinator: Callable[..., Any], clauses: Iterable[Any | None]) -> Any | None:
        filtered_clauses = [clause for clause in clauses if clause is not None]
        if not filtered_clauses:
            return None
        if len(filtered_clauses) == 1:
            return filtered_clauses[0]
        return combinator(*filtered_clauses)

    def _build_search_clause(column: Any, raw_text: Any) -> Any | None:
        if not isinstance(raw_text, str):
            return None

        search_text = raw_text.strip()
        if not search_text:
            return None

        python_type = _get_column_python_type(column.name)
        if python_type is str:
            return column.ilike(f"%{search_text}%")
        if python_type is dict:
            return cast(column, Text).ilike(f"%{search_text}%")
        return None

    def _is_required_text_column(column: Any) -> bool:
        return isinstance(column.type, Text) and not column.nullable

    def _build_text_clause(column: Any, raw_text: Any) -> Any | None:
        if not isinstance(raw_text, str):
            return None

        search_text = raw_text.strip()
        if not search_text:
            return None

        return column.ilike(f"%{search_text}%")

    def _get_required_text_columns(model: type[Any]) -> list[Any]:
        return [column for column in model.__table__.columns if _is_required_text_column(column)]

    def _build_search_text_clause(raw_text: Any) -> Any | None:
        direct_columns = _get_required_text_columns(spec.model)
        if direct_columns:
            return _combine_clauses(
                or_,
                (_build_text_clause(column, raw_text) for column in direct_columns),
            )

        relation_clauses: list[Any] = []
        for relationship in inspect(spec.model).relationships:
            if relationship.uselist or not any(column.foreign_keys for column in relationship.local_columns):
                continue

            target_columns = _get_required_text_columns(relationship.mapper.class_)
            if not target_columns:
                continue

            relationship_attr = getattr(spec.model, relationship.key, None)
            if relationship_attr is None:
                continue

            target_clause = _combine_clauses(
                or_,
                (_build_text_clause(column, raw_text) for column in target_columns),
            )
            if target_clause is not None:
                relation_clauses.append(relationship_attr.has(target_clause))

        relation_clause = _combine_clauses(or_, relation_clauses)
        if relation_clause is not None:
            return relation_clause

        return _combine_clauses(
            or_,
            (_build_search_clause(column, raw_text) for column in searchable_columns),
        )

    def _coerce_filter_bound(value: Any, python_type: type[Any]) -> Any | None:
        if value is None:
            return None

        try:
            if python_type is int:
                return int(value)
            if python_type is float:
                return float(value)
            if python_type is datetime:
                return parse_api_datetime_to_utc(value)
        except (TypeError, ValueError):
            return None

        return None

    def _coerce_bool_filter_value(value: Any) -> bool | None:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized_value = value.strip().lower()
            if normalized_value in {"true", "1", "yes"}:
                return True
            if normalized_value in {"false", "0", "no"}:
                return False
        if isinstance(value, int) and value in (0, 1):
            return bool(value)
        return None

    selected_clause = None
    normalized_selected_ids = normalize_int_ids(request.selected_ids, sort=True)
    if normalized_selected_ids:
        selected_clause = spec.model.id.in_(normalized_selected_ids)

    searchable_columns = [
        column
        for column in spec.model.__table__.columns
        if _get_column_python_type(column.name) in (str, dict)
    ]

    search_conditions: List[Any] = []
    search_text_clause = _build_search_text_clause(request.search_text)
    if search_text_clause is not None:
        search_conditions.append(search_text_clause)

    for field_name, raw_texts in (request.text_filter or {}).items():
        if field_name in spec.search_aliases:
            search_clause = _combine_clauses(
                or_,
                (
                    _build_search_clause(column, text)
                    for column_name in spec.search_aliases[field_name]
                    for column in [spec.model.__table__.columns.get(column_name)]
                    if column is not None
                    for text in raw_texts or []
                ),
            )
        else:
            column = spec.model.__table__.columns.get(field_name)
            if column is None:
                continue

            search_clause = _combine_clauses(
                or_,
                (
                    _build_search_clause(column, text)
                    for text in raw_texts or []
                ),
            )

        if search_clause is None:
            continue
        search_conditions.append(search_clause)

    filter_conditions: List[Any] = []
    for field_name, bounds in (request.filter or {}).items():
        python_type = _get_column_python_type(field_name)
        column = spec.model.__table__.columns.get(field_name)
        if column is None:
            continue

        values = list(bounds or [])
        non_null_values = [value for value in values if value is not None]
        if len(non_null_values) != len(values) and not non_null_values:
            if column.nullable:
                filter_conditions.append(column.is_(None))
            continue
        values = non_null_values

        if python_type is bool:
            bool_values = []
            for value in values:
                bool_value = _coerce_bool_filter_value(value)
                if bool_value is not None and bool_value not in bool_values:
                    bool_values.append(bool_value)
            if bool_values:
                filter_conditions.append(column.in_(bool_values))
            continue

        if python_type not in (int, float, datetime):
            continue

        min_value = _coerce_filter_bound(values[0], python_type) if len(values) > 0 else None
        max_value = _coerce_filter_bound(values[1], python_type) if len(values) > 1 else None
        filter_clause = _combine_clauses(
            and_,
            (
                column >= min_value if min_value is not None else None,
                column <= max_value if max_value is not None else None,
            ),
        )
        if filter_clause is not None:
            filter_conditions.append(filter_clause)

    scoped_clause = _combine_clauses(and_, [*search_conditions, *filter_conditions])
    where_clause = _combine_clauses(or_, (selected_clause, scoped_clause))
    where_clause = _combine_clauses(and_, (base_clause, where_clause))

    order_by_clauses = [spec.model.id.desc()]
    if request.sort:
        field_name = request.sort[0] if len(request.sort) > 0 else None
        direction = (request.sort[1] if len(request.sort) > 1 else "asc").lower()
        column = spec.model.__table__.columns.get(field_name) if field_name else None
        if column is not None:
            order_by_clauses = [column.desc() if direction == "desc" else column.asc()]
            if column is not spec.model.__table__.columns.get("id"):
                order_by_clauses.append(spec.model.id.desc())

    total_ids_stmt = select(spec.model.id)
    if where_clause is not None:
        total_ids_stmt = total_ids_stmt.where(where_clause)

    total_stmt = select(func.count()).select_from(total_ids_stmt.subquery())
    total = (await db.execute(total_stmt)).scalar_one()

    relation_fields = _get_relation_fields(spec)
    stmt = select(spec.model)
    load_options = _build_load_options(
        spec.model,
        [
            *((attr_name,) for _, attr_name, _ in relation_fields),
            *(path for path, _ in spec.computed_fields.values()),
        ],
    )
    if load_options or spec.load_options:
        stmt = stmt.options(*spec.load_options, *load_options)
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    stmt = stmt.order_by(*order_by_clauses)
    if request.offset:
        stmt = stmt.offset(request.offset)
    if request.limit is not None:
        stmt = stmt.limit(request.limit)

    entities = (await db.execute(stmt)).scalars().all()
    items: list[SchemaT] = []
    for entity in entities:
        item_data: dict[str, Any] = {}
        for field_name in spec.schema.model_fields:
            computed_spec = spec.computed_fields.get(field_name)
            if computed_spec is not None:
                path, attr_name = computed_spec
                current_items = [entity]
                for path_attr_name in path:
                    next_items: list[Any] = []
                    for item in current_items:
                        value = getattr(item, path_attr_name, None)
                        if value is None:
                            continue
                        if isinstance(value, Sequence) and not isinstance(value, (str, bytes, dict)):
                            next_items.extend(value)
                        else:
                            next_items.append(value)
                    current_items = next_items
                item_data[field_name] = normalize_int_ids(
                    (getattr(item, attr_name, None) for item in current_items),
                    sort=True,
                )
                continue

            relation_attr_name = _get_relation_attr_name(spec, field_name)
            if relation_attr_name is not None:
                relation_value = getattr(entity, relation_attr_name, None)
                related_items = (
                    list(relation_value)
                    if isinstance(relation_value, Sequence) and not isinstance(relation_value, (str, bytes, dict))
                    else ([] if relation_value is None else [relation_value])
                )
                item_data[field_name] = normalize_int_ids(
                    (getattr(item, "id", None) for item in related_items),
                    sort=True,
                )
                continue

            field_value = getattr(entity, field_name)
            if _get_column_python_type(field_name) is datetime and isinstance(field_value, datetime):
                field_value = db_datetime_to_utc(field_value)
            if field_name in spec.public_url_fields and isinstance(field_value, str) and field_value:
                field_value = public_file_url_from_reference(field_value)
            item_data[field_name] = field_value

        items.append(spec.schema.model_validate(item_data))

    return GetListResponseBase(
        total=total,
        items=items,
    )


async def upsert_items(
    db: AsyncSession,
    items: List[SchemaT],
    spec: CrudSpec[ModelT, SchemaT],
    cleanup_fields: Sequence[str] = (),
) -> List[UpsertResponseBase]:
    async def _fetch_entities_by_ids(
        model: type[Any],
        ids: Iterable[Any],
        load_options: Sequence[Any] = (),
    ) -> Dict[int, Any]:
        normalized_ids = normalize_int_ids(ids, sort=True)
        if not normalized_ids:
            return {}

        stmt = select(model).where(model.id.in_(normalized_ids))
        if load_options:
            stmt = stmt.options(*load_options)

        result = await db.execute(stmt)
        return {entity.id: entity for entity in result.scalars().all()}

    if not items:
        return []

    relation_fields = _get_relation_fields(spec)
    payload_excluded_fields = {"id", *(field_name for field_name, _, _ in relation_fields), *spec.computed_fields.keys()}
    prepared_items: List[Dict[str, Any]] = []
    relation_ids_by_model: dict[type[Any], set[int]] = defaultdict(set)

    for item in items:
        relation_ids_by_field: Dict[str, Optional[List[int]]] = {}
        for field_name, _, related_model in relation_fields:
            requested_ids = getattr(item, field_name, None)
            normalized_relation_ids = None if requested_ids is None else normalize_int_ids(requested_ids)
            relation_ids_by_field[field_name] = normalized_relation_ids
            relation_ids_by_model[related_model].update(normalized_relation_ids or [])

        prepared_items.append(
            {
                "entity_id": getattr(item, "id", None),
                "payload": {
                    field_name: _normalize_payload_value(
                        spec.model,
                        field_name,
                        _normalize_public_url_field(field_name, value)
                        if field_name in spec.public_url_fields
                        else value,
                    )
                    for field_name, value in item.model_dump(exclude=payload_excluded_fields).items()
                },
                "relation_ids_by_field": relation_ids_by_field,
            }
        )

    existing_entities_by_id = await _fetch_entities_by_ids(
        spec.model,
        (prepared_item["entity_id"] for prepared_item in prepared_items),
        load_options=_build_load_options(
            spec.model,
            ((attr_name,) for _, attr_name, _ in relation_fields),
        ),
    )

    entities_by_model: Dict[type[Any], Dict[int, Any]] = {}
    for model, ids in relation_ids_by_model.items():
        if ids:
            entities_by_model[model] = await _fetch_entities_by_ids(model, ids)

    pending_results: List[tuple[ModelT, Optional[Dict[str, List[int]]]]] = []
    orphan_candidates: list[str | None] = []
    for prepared_item in prepared_items:
        entity_id = prepared_item["entity_id"]
        entity = existing_entities_by_id.get(entity_id) if entity_id is not None else None
        if entity is None:
            entity = spec.model()
            db.add(entity)

        old_cleanup_values = {
            field_name: getattr(entity, field_name, None)
            for field_name in cleanup_fields
        }
        for field_name, value in prepared_item["payload"].items():
            setattr(entity, field_name, value)
            if field_name in cleanup_fields and old_cleanup_values.get(field_name) != value:
                orphan_candidates.append(old_cleanup_values.get(field_name))

        fk_not_found: Dict[str, List[int]] = {}
        relation_ids_by_field = prepared_item["relation_ids_by_field"]
        for field_name, attr_name, related_model in relation_fields:
            requested_ids = relation_ids_by_field[field_name]
            if requested_ids is None:
                continue

            resolved_entities: List[Any] = []
            missing_ids: List[int] = []
            entity_map = entities_by_model.get(related_model, {})

            for related_id in requested_ids:
                related_entity = entity_map.get(related_id)
                if related_entity is None:
                    missing_ids.append(related_id)
                    continue
                resolved_entities.append(related_entity)

            setattr(entity, attr_name, resolved_entities)
            if missing_ids:
                fk_not_found[field_name] = missing_ids

        pending_results.append((entity, fk_not_found or None))

    await db.flush()
    await db.commit()
    await cleanup_orphaned_object_keys(db, orphan_candidates)

    return [
        UpsertResponseBase(id=entity.id, fk_not_found=fk_not_found)
        for entity, fk_not_found in pending_results
    ]


async def delete_items(
    db: AsyncSession,
    spec: CrudSpec[ModelT, Any],
    ids: Iterable[Any],
    cleanup_fields: Sequence[str] = (),
) -> None:
    normalized_ids = normalize_int_ids(ids, sort=True)
    if not normalized_ids:
        return

    orphan_candidates: list[str | None] = []
    if cleanup_fields:
        stmt = select(*(getattr(spec.model, field_name) for field_name in cleanup_fields)).where(
            spec.model.id.in_(normalized_ids)
        )
        rows = (await db.execute(stmt)).all()
        for row in rows:
            orphan_candidates.extend(row._mapping[field_name] for field_name in cleanup_fields)

    await db.execute(sa_delete(spec.model).where(spec.model.id.in_(normalized_ids)))
    await db.commit()
    await cleanup_orphaned_object_keys(db, orphan_candidates)
