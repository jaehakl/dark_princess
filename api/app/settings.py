import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    db_url: str = os.getenv("DB_URL", "")
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_redirect_uri: str = os.getenv("GOOGLE_REDIRECT_URI", "")

    app_base_url: str = os.getenv("APP_BASE_URL", "http://localhost:5173")
    app_timezone: str = os.getenv("APP_TIMEZONE", "Asia/Seoul")

    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_ALG: str = "HS256"
    ACCESS_TTL_SEC: int = 1200
    REFRESH_TTL_SEC: int = 60*60*24*14
    COOKIE_DOMAIN: str = os.getenv("COOKIE_DOMAIN", "")
    SECURE_COOKIES: bool = True

    # AWS
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-northeast-2")
    S3_BUCKET: str = os.getenv("S3_BUCKET", "")
    S3_ENDPOINT_URL: str = os.getenv("S3_ENDPOINT_URL", "")
    CDN_URL: str = os.getenv("CDN_URL", "")
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "20"))

settings = Settings()
