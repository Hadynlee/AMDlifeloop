from __future__ import annotations

from ..config import settings


def _clean(value: str | None) -> str:
  return (value or "").strip()


def google_places_api_key() -> str:
  return _clean(settings.google_places_api_key)


def google_maps_browser_key() -> str | None:
  maps_key = _clean(settings.google_maps_api_key)
  if maps_key:
    return maps_key

  places_key = google_places_api_key()
  if places_key:
    return places_key
  return None


def google_places_enabled() -> bool:
  return bool(google_places_api_key())


def map_provider() -> str:
  return "google" if google_maps_browser_key() else "mock"


def places_provider() -> str:
  return "google" if google_places_enabled() else "seeded"
