import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import models  # noqa: F401  -- registers the tables before create_all()
from .config import settings
from .db import Base, SessionLocal, engine
from .routers import (
    auth,
    bar,
    bookings,
    courts,
    dashboard,
    expenses,
    hr,
    invoices,
    leads,
    members,
    notifications,
    payments,
    plans,
    public,
    shop,
    social,
)
from .security import AppError, limiter

# Registered once, so main.py does not need editing again as modules fill in.
_ROUTERS = (
    auth,
    plans,
    members,
    courts,
    bookings,
    social,
    shop,
    bar,
    payments,
    dashboard,
    leads,
    invoices,
    expenses,
    hr,
    public,
    notifications,
)

API_VERSION = "1.0.0"

logger = logging.getLogger("ccms")

_STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "INVALID_TOKEN",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    429: "RATE_LIMITED",
}


def envelope(
    status: int, code: str, message: str, details: dict[str, Any] | None = None
) -> JSONResponse:
    """SRS 6: every error has the same shape."""
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.seed:
        from seed import run_seed

        with SessionLocal() as session:
            run_seed(session)
    yield


app = FastAPI(title="CCMS API", version=API_VERSION, lifespan=lifespan)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# S-11: explicit allow-list from env, never "*" alongside credentials.
_origins = [o for o in settings.allowed_origins_list if o != "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return envelope(exc.status, exc.code, exc.message, exc.details)


@app.exception_handler(RequestValidationError)
async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return envelope(
        422,
        "VALIDATION_ERROR",
        "The request body failed validation.",
        {"errors": jsonable_encoder(exc.errors())},
    )


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return envelope(429, "RATE_LIMITED", "Too many requests. Please slow down.", {})


@app.exception_handler(StarletteHTTPException)
async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _STATUS_CODES.get(exc.status_code, "HTTP_ERROR")
    return envelope(exc.status_code, code, str(exc.detail))


@app.exception_handler(Exception)
async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    # S-18: details stay in the server log, never in the response.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return envelope(500, "INTERNAL_ERROR", "Something went wrong. Please try again.")


for _module in _ROUTERS:
    app.include_router(_module.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "version": API_VERSION}
