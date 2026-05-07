from __future__ import annotations

from fastapi import APIRouter

from ..schemas import RuntimeConfigOut
from ..services.providers import google_maps_browser_key, map_provider, places_provider

router = APIRouter(tags=["runtime"])


@router.get("/runtime/config", response_model=RuntimeConfigOut)
def runtime_config() -> dict:
  return {
    "map_provider": map_provider(),
    "places_provider": places_provider(),
    "google_maps_api_key": google_maps_browser_key(),
  }
