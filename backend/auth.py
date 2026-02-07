"""Simple password authentication middleware."""

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from config import APP_PASSWORD


class PasswordAuthMiddleware(BaseHTTPMiddleware):
    """Check X-App-Password header on protected routes."""

    OPEN_PATHS = {"/api/health", "/docs", "/openapi.json", "/favicon.ico"}

    async def dispatch(self, request: Request, call_next):
        # Allow health check, docs, and OPTIONS (CORS preflight)
        if request.url.path in self.OPEN_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        # Allow SSE progress endpoint without auth (job_id is secret enough)
        if request.url.path.startswith("/api/progress/"):
            return await call_next(request)

        # Check password header
        password = request.headers.get("X-App-Password", "")
        if not APP_PASSWORD or password != APP_PASSWORD:
            raise HTTPException(status_code=401, detail="Invalid or missing password")

        return await call_next(request)

