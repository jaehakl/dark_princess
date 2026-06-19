import json
import unittest
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageDraw

from service.image_util import postprocess_image


class ImagePostprocessTest(unittest.TestCase):
    def test_enhance_returns_png_image(self):
        output, media_type = postprocess_image(self._image_bytes(), "enhance", "{}")

        image_format, image_size = self._image_info(output)
        self.assertEqual(media_type, "image/png")
        self.assertEqual(image_format, "PNG")
        self.assertEqual(image_size, (16, 12))

    def test_resize_uses_requested_width_and_preserves_ratio(self):
        output, media_type = postprocess_image(
            self._image_bytes(),
            "resize",
            json.dumps({"width": 32}),
        )

        _image_format, image_size = self._image_info(output)
        self.assertEqual(media_type, "image/png")
        self.assertEqual(image_size, (32, 24))

    def test_upscale_cleanup_uses_default_2x_scale(self):
        output, _media_type = postprocess_image(self._image_bytes(), "upscale_cleanup", "{}")

        _image_format, image_size = self._image_info(output)
        self.assertEqual(image_size, (32, 24))

    def test_line_operations_return_images(self):
        for operation in ("line_boost", "edges"):
            with self.subTest(operation=operation):
                output, media_type = postprocess_image(self._image_bytes(), operation, "{}")
                _image_format, image_size = self._image_info(output)
                self.assertEqual(media_type, "image/png")
                self.assertEqual(image_size, (16, 12))

    def test_invalid_operation_returns_400(self):
        with self.assertRaises(HTTPException) as context:
            postprocess_image(self._image_bytes(), "unknown", "{}")

        self.assertEqual(context.exception.status_code, 400)

    def test_invalid_json_returns_400(self):
        with self.assertRaises(HTTPException) as context:
            postprocess_image(self._image_bytes(), "enhance", "{")

        self.assertEqual(context.exception.status_code, 400)

    def test_out_of_range_parameter_returns_400(self):
        with self.assertRaises(HTTPException) as context:
            postprocess_image(self._image_bytes(), "gamma", json.dumps({"gamma": 0}))

        self.assertEqual(context.exception.status_code, 400)

    def _image_bytes(self) -> bytes:
        image = Image.new("RGB", (16, 12), (170, 170, 170))
        draw = ImageDraw.Draw(image)
        for x in range(image.width):
            color = (100 + x * 6, 120, 150)
            draw.line((x, 0, x, image.height), fill=color)
        draw.line((1, 2, 14, 9), fill=(20, 20, 20), width=2)

        output = BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    def _image_info(self, image_bytes: bytes) -> tuple[str | None, tuple[int, int]]:
        with Image.open(BytesIO(image_bytes)) as image:
            return image.format, image.size


if __name__ == "__main__":
    unittest.main()
