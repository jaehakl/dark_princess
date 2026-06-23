import math
from collections.abc import Iterable

from fastapi import HTTPException, status


VECTOR_DIMENSION = 1024


def cosine_distance(left: Iterable[float], right: Iterable[float]) -> float | None:
    left_values = list(left)
    right_values = list(right)
    left_norm = math.sqrt(sum(value * value for value in left_values))
    right_norm = math.sqrt(sum(value * value for value in right_values))
    if left_norm == 0 or right_norm == 0:
        return None

    dot_product = sum(left_value * right_value for left_value, right_value in zip(left_values, right_values))
    return 1 - dot_product / (left_norm * right_norm)


def validate_embedding(value: object, field_name: str) -> list[float]:
    if value is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} is required",
        )
    if not isinstance(value, list) or len(value) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be a {VECTOR_DIMENSION}-dimension vector",
        )

    try:
        return [float(item) for item in value]
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must contain only numbers",
        ) from exc
