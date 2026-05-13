from fastapi import APIRouter, Body, HTTPException, status

from service.settings import (
    get_stable_diffusion_model_path_config,
    update_stable_diffusion_model_path_config,
)

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/stable-diffusion-model-path")
async def api_get_stable_diffusion_model_path() -> dict[str, str]:
    return get_stable_diffusion_model_path_config()


@router.post("/stable-diffusion-model-path")
async def api_update_stable_diffusion_model_path(
    value: str = Body(..., embed=True),
) -> dict[str, str]:
    try:
        return update_stable_diffusion_model_path_config(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
