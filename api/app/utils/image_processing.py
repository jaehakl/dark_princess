from __future__ import annotations

from math import isfinite

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageOps

MAX_OUTPUT_SIDE = 4096
MAX_OUTPUT_PIXELS = MAX_OUTPUT_SIDE * MAX_OUTPUT_SIDE


def process_image(image: Image.Image, operation: str, parameters: dict[str, object] | None = None) -> Image.Image:
    params = parameters or {}
    if not isinstance(params, dict):
        raise ValueError("parameters must be an object")

    op = operation.strip().lower().replace("-", "_") if isinstance(operation, str) else ""
    if not op:
        raise ValueError("operation is required")

    if image.mode != "RGB":
        image = image.convert("RGB")

    operations = {
        "auto_contrast": _auto_contrast,
        "saturation": _saturation,
        "contrast": _contrast,
        "sharpness": _sharpness,
        "gamma": _gamma,
        "clahe": _clahe,
        "denoise": _denoise,
        "resize": _resize,
        "line_boost": _line_boost,
        "edges": _edges,
        "cleanup": _cleanup,
        "enhance": _enhance,
        "line_art": _line_art,
        "upscale_cleanup": _upscale_cleanup,
    }
    processor = operations.get(op)
    if processor is None:
        raise ValueError(f"unsupported operation: {operation}")

    processed = processor(image, params)
    _validate_output_size(processed.size)
    return processed


def _cleanup(image: Image.Image, params: dict[str, object]) -> Image.Image:
    image = _auto_contrast(image, {"cutoff": _number(params, "auto_contrast_cutoff", "cutoff", default=1, min_value=0, max_value=50)})
    image = _clahe(image, {"clip_limit": _number(params, "clahe_clip_limit", default=1.8, min_value=0.1, max_value=10)})
    image = _denoise(image, {"h": _number(params, "denoise_h", "denoise_strength", default=2.5, min_value=0, max_value=30)})
    image = _saturation(image, {"factor": _number(params, "saturation_factor", "saturation", default=1.08, min_value=0, max_value=5)})
    image = _gamma(image, {"gamma": _number(params, "gamma", default=0.95, min_value=0.1, max_value=5)})
    return _sharpness(image, {"factor": _number(params, "sharpness_factor", "sharpness", default=1.15, min_value=0, max_value=5)})


def _enhance(image: Image.Image, params: dict[str, object]) -> Image.Image:
    image = _auto_contrast(image, {"cutoff": _number(params, "auto_contrast_cutoff", "cutoff", default=1, min_value=0, max_value=50)})
    image = _saturation(image, {"factor": _number(params, "saturation_factor", "saturation", default=1.2, min_value=0, max_value=5)})
    image = _contrast(image, {"factor": _number(params, "contrast_factor", "contrast", default=1.15, min_value=0, max_value=5)})
    return _sharpness(image, {"factor": _number(params, "sharpness_factor", "sharpness", default=1.25, min_value=0, max_value=5)})


def _line_art(image: Image.Image, params: dict[str, object]) -> Image.Image:
    image = _line_boost(image, {"amount": _number(params, "line_amount", "amount", default=0.55, min_value=0, max_value=1)})
    return _sharpness(image, {"factor": _number(params, "sharpness_factor", "sharpness", default=1.4, min_value=0, max_value=5)})


def _upscale_cleanup(image: Image.Image, params: dict[str, object]) -> Image.Image:
    image = _resize(image, {"scale": _number(params, "scale", default=2, min_value=0.1, max_value=8)})
    image = _denoise(image, {"h": _number(params, "denoise_h", "denoise_strength", default=2, min_value=0, max_value=30)})
    return _sharpness(image, {"factor": _number(params, "sharpness_factor", "sharpness", default=1.2, min_value=0, max_value=5)})


def _auto_contrast(image: Image.Image, params: dict[str, object]) -> Image.Image:
    cutoff = _number(params, "cutoff", default=0, min_value=0, max_value=50)
    return ImageOps.autocontrast(image, cutoff=cutoff)


def _saturation(image: Image.Image, params: dict[str, object]) -> Image.Image:
    factor = _number(params, "factor", default=1.2, min_value=0, max_value=5)
    return ImageEnhance.Color(image).enhance(factor)


def _contrast(image: Image.Image, params: dict[str, object]) -> Image.Image:
    factor = _number(params, "factor", default=1.15, min_value=0, max_value=5)
    return ImageEnhance.Contrast(image).enhance(factor)


def _sharpness(image: Image.Image, params: dict[str, object]) -> Image.Image:
    factor = _number(params, "factor", default=1.4, min_value=0, max_value=5)
    return ImageEnhance.Sharpness(image).enhance(factor)


def _gamma(image: Image.Image, params: dict[str, object]) -> Image.Image:
    gamma = _number(params, "gamma", default=0.95, min_value=0.1, max_value=5)
    inverse_gamma = 1 / gamma
    table = [round(((value / 255) ** inverse_gamma) * 255) for value in range(256)]
    return image.point(table * len(image.getbands()))


def _clahe(image: Image.Image, params: dict[str, object]) -> Image.Image:
    clip_limit = _number(params, "clip_limit", default=2, min_value=0.1, max_value=10)
    tile_grid_size = _integer(params, "tile_grid_size", default=8, min_value=2, max_value=32)
    rgb = _pil_to_rgb_array(image)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    lightness, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_grid_size, tile_grid_size))
    lightness = clahe.apply(lightness)
    merged = cv2.merge((lightness, a_channel, b_channel))
    return _rgb_array_to_pil(cv2.cvtColor(merged, cv2.COLOR_LAB2RGB))


def _denoise(image: Image.Image, params: dict[str, object]) -> Image.Image:
    h = _number(params, "h", "strength", default=3, min_value=0, max_value=30)
    h_color = _number(params, "h_color", default=h, min_value=0, max_value=30)
    template_window_size = _odd_integer(params, "template_window_size", default=7, min_value=3, max_value=21)
    search_window_size = _odd_integer(params, "search_window_size", default=21, min_value=3, max_value=35)
    if h == 0 and h_color == 0:
        return image.copy()

    rgb = _pil_to_rgb_array(image)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    denoised = cv2.fastNlMeansDenoisingColored(
        bgr,
        None,
        float(h),
        float(h_color),
        template_window_size,
        search_window_size,
    )
    return _rgb_array_to_pil(cv2.cvtColor(denoised, cv2.COLOR_BGR2RGB))


def _resize(image: Image.Image, params: dict[str, object]) -> Image.Image:
    width_value = params.get("width")
    height_value = params.get("height")
    width = _optional_integer(width_value, "width", min_value=1, max_value=MAX_OUTPUT_SIDE)
    height = _optional_integer(height_value, "height", min_value=1, max_value=MAX_OUTPUT_SIDE)

    if width is None and height is None:
        scale = _number(params, "scale", default=2, min_value=0.1, max_value=8)
        width = round(image.width * scale)
        height = round(image.height * scale)
    elif width is None:
        width = round(image.width * (height / image.height))
    elif height is None:
        height = round(image.height * (width / image.width))

    assert width is not None and height is not None
    _validate_output_size((width, height))
    interpolation = _interpolation(params.get("interpolation"), scale_up=width >= image.width or height >= image.height)
    resized = cv2.resize(_pil_to_rgb_array(image), (width, height), interpolation=interpolation)
    return _rgb_array_to_pil(resized)


def _line_boost(image: Image.Image, params: dict[str, object]) -> Image.Image:
    amount = _number(params, "amount", default=0.45, min_value=0, max_value=1)
    block_size = _odd_integer(params, "block_size", default=15, min_value=3, max_value=101)
    c_value = _number(params, "c", default=8, min_value=-30, max_value=30)
    dilate = _integer(params, "dilate", default=1, min_value=0, max_value=5)

    rgb = _pil_to_rgb_array(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    mask = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY_INV,
        block_size,
        c_value,
    )
    if dilate:
        kernel = np.ones((dilate, dilate), dtype=np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)

    mask_float = (mask.astype(np.float32) / 255.0)[:, :, None]
    darkened = rgb.astype(np.float32) * (1 - mask_float * amount)
    return _rgb_array_to_pil(np.clip(darkened, 0, 255).astype(np.uint8))


def _edges(image: Image.Image, params: dict[str, object]) -> Image.Image:
    low_threshold = _number(params, "low_threshold", "low", default=80, min_value=0, max_value=255)
    high_threshold = _number(params, "high_threshold", "high", default=160, min_value=0, max_value=255)
    amount = _number(params, "amount", default=0.65, min_value=0, max_value=1)
    mode = str(params.get("mode", "overlay")).strip().lower()
    if mode not in {"overlay", "mask"}:
        raise ValueError("mode must be overlay or mask")
    if high_threshold < low_threshold:
        raise ValueError("high_threshold must be greater than or equal to low_threshold")

    rgb = _pil_to_rgb_array(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, low_threshold, high_threshold)
    if mode == "mask":
        mask = 255 - edges
        return Image.fromarray(mask, mode="L").convert("RGB")

    mask_float = (edges.astype(np.float32) / 255.0)[:, :, None]
    darkened = rgb.astype(np.float32) * (1 - mask_float * amount)
    return _rgb_array_to_pil(np.clip(darkened, 0, 255).astype(np.uint8))


def _number(
    params: dict[str, object],
    *names: str,
    default: float,
    min_value: float | None = None,
    max_value: float | None = None,
) -> float:
    value = default
    for name in names:
        if name in params and params[name] is not None:
            value = params[name]
            break
    if isinstance(value, bool):
        raise ValueError(f"{names[0]} must be a number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{names[0]} must be a number") from exc
    if not isfinite(number):
        raise ValueError(f"{names[0]} must be finite")
    if min_value is not None and number < min_value:
        raise ValueError(f"{names[0]} must be at least {min_value}")
    if max_value is not None and number > max_value:
        raise ValueError(f"{names[0]} must be at most {max_value}")
    return number


def _integer(
    params: dict[str, object],
    name: str,
    *,
    default: int,
    min_value: int,
    max_value: int,
) -> int:
    value = params.get(name, default)
    integer = _optional_integer(value, name, min_value=min_value, max_value=max_value)
    assert integer is not None
    return integer


def _odd_integer(
    params: dict[str, object],
    name: str,
    *,
    default: int,
    min_value: int,
    max_value: int,
) -> int:
    value = _integer(params, name, default=default, min_value=min_value, max_value=max_value)
    if value % 2 == 0:
        raise ValueError(f"{name} must be an odd number")
    return value


def _optional_integer(value: object, name: str, *, min_value: int, max_value: int) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{name} must be an integer")
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"{name} must be an integer")
    try:
        integer = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if integer < min_value:
        raise ValueError(f"{name} must be at least {min_value}")
    if integer > max_value:
        raise ValueError(f"{name} must be at most {max_value}")
    return integer


def _interpolation(value: object, *, scale_up: bool) -> int:
    name = str(value or ("lanczos" if scale_up else "area")).strip().lower()
    interpolations = {
        "area": cv2.INTER_AREA,
        "cubic": cv2.INTER_CUBIC,
        "lanczos": cv2.INTER_LANCZOS4,
        "linear": cv2.INTER_LINEAR,
        "nearest": cv2.INTER_NEAREST,
    }
    interpolation = interpolations.get(name)
    if interpolation is None:
        raise ValueError("interpolation must be area, cubic, lanczos, linear, or nearest")
    return interpolation


def _validate_output_size(size: tuple[int, int]) -> None:
    width, height = size
    if width < 1 or height < 1:
        raise ValueError("output image size must be positive")
    if width > MAX_OUTPUT_SIDE or height > MAX_OUTPUT_SIDE:
        raise ValueError(f"output image side must be at most {MAX_OUTPUT_SIDE}px")
    if width * height > MAX_OUTPUT_PIXELS:
        raise ValueError(f"output image area must be at most {MAX_OUTPUT_PIXELS} pixels")


def _pil_to_rgb_array(image: Image.Image) -> np.ndarray:
    return np.array(image.convert("RGB"), dtype=np.uint8)


def _rgb_array_to_pil(array: np.ndarray) -> Image.Image:
    return Image.fromarray(array, mode="RGB")
