from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
import requests

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from settings import settings
from db import SessionLocal  # 기존 db.py 모델 임포트

from user_auth.db import OAuthState, User, Identity, UserRole, Role
from models import UserData
from user_auth.utils.auth_utils import random_urlsafe, pkce_challenge, set_return_to_cookie, pop_return_to_cookie
from user_auth.utils.jwt import make_access, make_refresh, verify_token

router = APIRouter(prefix="/auth", tags=["auth"])

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = "openid email profile"
PROVIDER = "google"

async def get_db():
    async with SessionLocal() as db:
        try:
            yield db
        except Exception:
            await db.rollback()
            raise

# 로그인 시작
@router.get("/google/start")
async def google_start(request: Request, return_to: str | None = None, db: AsyncSession = Depends(get_db)):
    state = random_urlsafe(32)
    nonce = random_urlsafe(32)
    code_verifier = random_urlsafe(64)
    challenge = pkce_challenge(code_verifier)

    st = OAuthState(
        provider=PROVIDER,   # Enum을 쓰면 OAuthProvider.google
        state=state,
        nonce=nonce,
        code_verifier=code_verifier,
        redirect_uri=settings.google_redirect_uri,
    )
    db.add(st)
    await db.commit()

    # 사용자가 눌렀던 페이지로 되돌아가기 위해 임시 쿠키에 저장
    resp = RedirectResponse(url="/")
    set_return_to_cookie(resp, return_to)

    from urllib.parse import urlencode
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    resp.headers["Location"] = f"{AUTH_URL}?{urlencode(params)}"
    resp.status_code = 307
    return resp

# 콜백
@router.get("/google/callback")
async def google_callback(request: Request, state: str = "", code: str = "", db: AsyncSession = Depends(get_db)):
    if not state or not code:
        raise HTTPException(400, "missing state or code")

    st = await db.scalar(select(OAuthState).where(OAuthState.state == state))
    if not st or st.consumed_at is not None:
        raise HTTPException(400, "invalid or used state")

    # 토큰 교환
    data = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": st.redirect_uri or settings.google_redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": st.code_verifier,
    }
    tok = requests.post(TOKEN_URL, data=data, timeout=10)
    if tok.status_code != 200:
        raise HTTPException(400, f"token exchange failed: {tok.text}")
    token_json = tok.json()
    id_tok = token_json.get("id_token")

    # ID 토큰 검증
    try:
        req = google_requests.Request()
        idinfo = google_id_token.verify_oauth2_token(id_tok, req, settings.google_client_id)
        # nonce는 직접 확인
        if st.nonce and idinfo.get("nonce") != st.nonce:
            raise ValueError("nonce mismatch")
    except Exception as e:
        raise HTTPException(400, f"id_token verification failed: {e}")

    sub = idinfo["sub"]
    email = idinfo.get("email")
    email_verified = bool(idinfo.get("email_verified", False))
    name = idinfo.get("name")
    picture = idinfo.get("picture")

    # 아이덴티티 조회/생성
    ident = await db.scalar(select(Identity).where(Identity.provider == PROVIDER, Identity.provider_user_id == sub))
    if ident:
        user = await db.get(User, ident.user_id)
    else:
        user = None
        if email and email_verified:
            # CITEXT면 == email, TEXT면 lower 비교 등으로 수정
            user = await db.scalar(select(User).where(User.email == email))
        if not user:
            user = User(
                email=email,
                email_verified_at=func.now() if email_verified else None,
                display_name=name,
                picture_url=picture,
                is_active=True,
            )
            db.add(user)
            await db.flush()  # user.id 확보

        # 기본 "user" 역할 추가
        user_role = await db.scalar(select(Role).where(Role.name == "user"))
        if not user_role:
            # "user" 역할이 없으면 생성
            user_role = Role(name="user")
            db.add(user_role)
            await db.flush()  # role.id 확보
        
        user_role_entry = UserRole(user_id=user.id, role_id=user_role.id)
        db.add(user_role_entry)

        ident = Identity(
            user_id=user.id,
            provider=PROVIDER,
            provider_user_id=sub,
            email=email,
            email_verified=email_verified,
            raw_profile=idinfo,
        )
        db.add(ident)

    ident.email = email
    ident.email_verified = email_verified
    ident.raw_profile = idinfo

    st.consumed_at = func.now()
    await db.commit()

    # 3) 내부 JWT 생성
    user = await db.scalar(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .where(User.id == user.id)
    )
    access = make_access(user)
    refresh = make_refresh(str(user.id))

    # 돌아갈 곳
    return_to = request.cookies.get("rt") or settings.app_base_url
    resp = RedirectResponse(return_to)

    # 4) 쿠키/바디로 전달
    set_auth_cookies(resp, access, refresh)

    pop_return_to_cookie(resp)
    return resp


@router.get("/me", response_model=UserData)
async def check_user(request: Request) -> UserData:

    token = request.cookies.get("access_token")

    # 2) 없으면 Authorization 헤더 (Bearer …) 시도
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        claims = verify_token(token)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing sub")

    return UserData(
        id=str(user_id),
        email=claims.get("email"),
        display_name=claims.get("display_name"),
        picture_url=claims.get("picture_url"),
        is_active=claims.get("is_active"),
        created_at=claims.get("created_at"),
        updated_at=claims.get("updated_at"),
        roles=claims.get("roles") or [],
    )


@router.get("/refresh")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    rtoken = request.cookies.get("refresh_token")
    if not rtoken:
        raise HTTPException(status_code=401, detail="No refresh token")

    try:
        claims = verify_token(rtoken)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid refresh: {e}")

    if claims.get("typ") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    user_id = claims["sub"]
    user = await db.scalar(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .where(User.id == user_id)
    )
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive")

    # (선택) 토큰 로테이션/블록리스트 검사·등록

    access = make_access(user)
    refresh_new = make_refresh(user_id)   # 로테이션 권장

    # 쿠키 갱신
    kwargs = {"httponly": True, "secure": settings.SECURE_COOKIES, "samesite": "lax", "domain": settings.COOKIE_DOMAIN}
    response.set_cookie("access_token", access, max_age=settings.ACCESS_TTL_SEC, path="/", **kwargs)
    response.set_cookie("refresh_token", refresh_new, max_age=settings.REFRESH_TTL_SEC, path="/", **kwargs)
    return {"ok": True}


@router.post("/logout")
async def logout(resp: Response):
    kwargs = {"httponly": True, "secure": settings.SECURE_COOKIES, "samesite": "lax", "domain": settings.COOKIE_DOMAIN}
    resp.delete_cookie("access_token", path="/", **kwargs)
    resp.delete_cookie("refresh_token", path="/", **kwargs)
    return {"ok": True}

def set_auth_cookies(resp: Response, access: str, refresh: str):
    kwargs = {"httponly": True, "secure": settings.SECURE_COOKIES, "samesite": "lax", "domain": settings.COOKIE_DOMAIN}
    resp.set_cookie("access_token", access, max_age=settings.ACCESS_TTL_SEC, path="/", **kwargs)
    resp.set_cookie("refresh_token", refresh, max_age=settings.REFRESH_TTL_SEC, path="/", **kwargs)
