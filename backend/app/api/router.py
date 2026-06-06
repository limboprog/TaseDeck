from fastapi import APIRouter

from app.api.v1.endpoints import mcp

api_router = APIRouter()
api_router.include_router(mcp.router)
