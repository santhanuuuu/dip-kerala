"""
auth.py -- Google OAuth sign-in for regular users, plus a separate admin login for
reviewing place submissions.

WHERE TO ADD YOUR CREDENTIALS: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and JWT_SECRET_KEY
in your .env file (see .env.example). Get the Google credentials from
console.cloud.google.com -> APIs & Services -> Credentials -> OAuth client ID.

ADMIN LOGIN: set ADMIN_EMAIL and ADMIN_PASSWORD as environment variables (in Render's
dashboard for production, or your local .env for development) -- NEVER commit real values
for these to .env.example or anywhere in git. If either is unset, admin login is disabled
entirely (fails closed, not open) rather than falling back to a guessable default.
"""
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
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

# Admin credentials -- deliberately read from environment only, with no default value.
# See module docstring: this must never have a hardcoded fallback, since this file is
# committed to a public repo.
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")


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


class AdminLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/admin-login")
def admin_login(body: AdminLoginRequest):
    """Separate login path for reviewing place submissions -- not tied to any Google
    account. Returns a JWT with is_admin=true if the credentials match the environment
    variables. Deliberately generic error message (doesn't reveal whether the email or
    password was wrong) to make credential-guessing slightly harder."""
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="Admin login is not configured on this deployment.")
    if body.email != ADMIN_EMAIL or body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    if not JWT_SECRET_KEY:
        raise HTTPException(status_code=500, detail="JWT_SECRET_KEY not configured.")
    payload = {
        "user_id": -1,  # not a real users.id row -- admin isn't a Google-linked account
        "email": ADMIN_EMAIL,
        "name": "Admin",
        "picture": None,
        "is_admin": True,
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return {"token": token}


def _create_jwt(user: User) -> str:
    payload = {
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.avatar_url,
        "is_admin": False,
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
        if payload.get("is_admin"):
            return None  # admin isn't a real User row; callers that need admin use get_current_admin_required
        return db.query(User).filter(User.id == payload["user_id"]).first()
    except JWTError:
        return None


def get_current_user_required(authorization: str = Header(None), db: Session = Depends(get_db)):
    """For endpoints that require login (place submission, damage assessment upload)."""
    user = get_current_user_optional(authorization, db)
    if not user:
        raise HTTPException(status_code=401, detail="Login required. Sign in with Google first.")
    return user


def get_current_admin_required(authorization: str = Header(None)):
    """For endpoints that require the admin login specifically (reviewing submissions) --
    NOT satisfied by an ordinary signed-in Google user. This is the fix for the previous
    gap where any logged-in user could approve/reject place submissions."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Admin login required.")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Admin login required.")
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return True
