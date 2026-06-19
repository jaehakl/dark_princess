import asyncio
import sys
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from PIL import Image

sys.path.append(str(Path(__file__).resolve().parents[1] / "app"))

from models import GenerateImageRequestBase, ImageGenerationSettingsBase
from routers.image_util import api_generate_image_blob
from service.image import generate_image_blob


class ImageGenerateBlobTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        asyncio.get_running_loop().slow_callback_duration = 5

    async def test_api_returns_png_blob_and_seed_header(self):
        generated_image = Image.new("RGB", (16, 12), (20, 40, 60))
        request = self._request()

        with (
            patch("service.image.get_available_cuda_device_ids", return_value=[2]),
            patch("service.image.resolve_image_generation_model_path", return_value=Path("model.safetensors")),
            patch(
                "service.image.generate_images_batch",
                new=AsyncMock(return_value=([generated_image], [1234])),
            ) as generate_batch,
            patch("service.image.upload_fileobj") as upload_fileobj,
        ):
            response = await api_generate_image_blob(request)

        self.assertEqual(response.media_type, "image/png")
        self.assertEqual(response.headers["x-image-seed"], "1234")
        self.assertEqual(self._image_info(response.body), ("PNG", (16, 12)))
        upload_fileobj.assert_not_called()
        self.assertEqual(generate_batch.call_args.args[1], "t2i")
        self.assertEqual(generate_batch.call_args.args[2], ["castle"])
        self.assertEqual(generate_batch.call_args.args[3], ["low quality"])
        self.assertEqual(generate_batch.call_args.kwargs["device_id"], 2)

    async def test_blank_positive_prompt_returns_400(self):
        with self.assertRaises(HTTPException) as context:
            await generate_image_blob(self._request(positive_prompt=" "))

        self.assertEqual(context.exception.status_code, 400)

    async def test_no_cuda_device_returns_500(self):
        with (
            patch("service.image.get_available_cuda_device_ids", return_value=[]),
            patch("service.image.resolve_image_generation_model_path", return_value=Path("model.safetensors")),
        ):
            with self.assertRaises(HTTPException) as context:
                await generate_image_blob(self._request())

        self.assertEqual(context.exception.status_code, 500)

    def _request(self, positive_prompt: str = " castle ") -> GenerateImageRequestBase:
        return GenerateImageRequestBase(
            positive_prompt=positive_prompt,
            negative_prompt=" low quality ",
            model_parameters=ImageGenerationSettingsBase(
                model_filename="model.safetensors",
                steps=1,
                cfg=2,
                strength=1,
                sampler="",
                scheduler="",
                height=16,
                width=16,
            ),
        )

    def _image_info(self, image_bytes: bytes) -> tuple[str | None, tuple[int, int]]:
        with Image.open(BytesIO(image_bytes)) as image:
            return image.format, image.size


if __name__ == "__main__":
    unittest.main()
