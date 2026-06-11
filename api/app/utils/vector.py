from fastapi import HTTPException, status


VECTOR_DIMENSION = 1024


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
