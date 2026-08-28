"""
auth.py -- Google OAuth sign-in, then issues our own JWT for subsequent requests.

WHERE TO ADD YOUR CREDENTIALS: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and JWT_SECRET_KEY
in your .env file (see .env.example). Get the Google credentials from
console.cloud.google.com -> APIs & Services -> Credentials -> OAuth client ID.
"""
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import requests as http_requests

from db.session import get_db
from db.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")


def _require_config():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not JWT_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth / JWT not configured. Set GOOGLE_CLIENT_ID, "
                   "GOOGLE_CLIENT_SECRET, and JWT_SECRET_KEY in your .env file.",
        )


@router.get("/google/login")
def google_login():
    """Redirects the user to Google's consent screen."""
    _require_config()
    redirect_uri = f"{BACKEND_URL}/api/auth/google/callback"
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
    )
    return RedirectResponse(google_auth_url)


@router.get("/google/callback")
def google_callback(code: str, db: Session = Depends(get_db)):
    """Google redirects here after consent. Exchanges the code for user info, creates/finds
    the user, issues our JWT, and redirects back to the frontend with the token."""
    _require_config()
    redirect_uri = f"{BACKEND_URL}/api/auth/google/callback"

    token_response = http_requests.post("https://oauth2.googleapis.com/token", data={
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    })
    token_response.raise_for_status()
    tokens = token_response.json()

    idinfo = id_token.verify_oauth2_token(tokens["id_token"], google_requests.Request(), GOOGLE_CLIENT_ID)

    user = db.query(User).filter(User.google_id == idinfo["sub"]).first()
    if not user:
        user = User(google_id=idinfo["sub"], email=idinfo["email"], name=idinfo.get("name"), avatar_url=idinfo.get("picture"))
        db.add(user)
        db.commit()
        db.refresh(user)

    jwt_token = _create_jwt(user)
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={jwt_token}")


def _create_jwt(user: User) -> str:
    payload = {
        "user_id": user.id,
        "email": user.email,
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def get_current_user_optional(authorization: str = Header(None), db: Session = Depends(get_db)):
    """For endpoints that work whether or not the user is logged in (search, risk query)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return db.query(User).filter(User.id == payload["user_id"]).first()
    except JWTError:
        return None


def get_current_user_required(authorization: str = Header(None), db: Session = Depends(get_db)):
    """For endpoints that require login (place submission, damage assessment upload)."""
    user = get_current_user_optional(authorization, db)
    if not user:
        raise HTTPException(status_code=401, detail="Login required. Sign in with Google first.")
    return user
