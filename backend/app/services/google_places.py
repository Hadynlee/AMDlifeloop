from __future__ import annotations

from typing import Any

import httpx
import psycopg

from ..config import settings
from .geo import cell_id_to_center, convert_gps_to_cell
from .providers import google_places_api_key

GOOGLE_NEARBY_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

CATEGORY_TO_GOOGLE_TYPE = {
  "cafe": "cafe",
  "food": "restaurant",
  "fitness": "gym",
  "nature": "park",
  "campus": "university",
  "commute": "transit_station",
  "shopping": "shopping_mall",
  "nightlife": "bar",
}

GOOGLE_TYPE_TO_CATEGORY = {
  "cafe": "cafe",
  "restaurant": "food",
  "meal_takeaway": "food",
  "meal_delivery": "food",
  "gym": "fitness",
  "park": "nature",
  "campground": "nature",
  "university": "campus",
  "school": "campus",
  "library": "campus",
  "transit_station": "commute",
  "subway_station": "commute",
  "bus_station": "commute",
  "train_station": "commute",
  "shopping_mall": "shopping",
  "department_store": "shopping",
  "clothing_store": "shopping",
  "bar": "nightlife",
  "night_club": "nightlife",
}


def _top_cell_ids(profile: dict[str, Any], limit: int = 4) -> list[str]:
  frequent_cells = profile.get("frequent_cells") or []
  cell_ids: list[str] = []
  for item in frequent_cells:
    cell_id = item.get("cell_id")
    if cell_id:
      cell_ids.append(str(cell_id))
  return cell_ids[:limit]


def _top_categories(profile: dict[str, Any], limit: int = 4) -> list[str]:
  values = profile.get("frequent_place_categories") or []
  categories: list[str] = []
  for item in values:
    category = str(item.get("category") or "").lower().strip()
    if category and category != "general":
      categories.append(category)
  return categories[:limit]


def _route_anchors(conn: psycopg.Connection, profile: dict[str, Any], limit: int = 3) -> list[tuple[float, float]]:
  cell_ids = _top_cell_ids(profile, limit=limit * 2)
  if not cell_ids:
    return []

  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT cell_id, center_lat, center_lng
      FROM area_cells
      WHERE cell_id = ANY(%s)
      """,
      (cell_ids,),
    )
    rows = cur.fetchall()

  centers_by_cell = {
    str(row["cell_id"]): (float(row["center_lat"]), float(row["center_lng"]))
    for row in rows
  }

  ordered_centers: list[tuple[float, float]] = []
  for cell_id in cell_ids:
    center = centers_by_cell.get(cell_id)
    if center is None:
      center = cell_id_to_center(cell_id, grid_size_meters=settings.grid_size_meters)
    if center is not None:
      ordered_centers.append(center)

  return ordered_centers[:limit]


def _search_types(profile: dict[str, Any], limit: int = 4) -> list[str]:
  categories = _top_categories(profile, limit=limit)
  mapped = [CATEGORY_TO_GOOGLE_TYPE.get(category) for category in categories]
  search_types = [value for value in mapped if value]
  if not search_types:
    search_types = ["restaurant", "cafe", "gym"]
  return search_types[:limit]


def _coarse_category(google_types: list[str] | None) -> str:
  for value in google_types or []:
    category = GOOGLE_TYPE_TO_CATEGORY.get(str(value).lower())
    if category:
      return category
  return "general"


def fetch_google_places_for_profile(
  conn: psycopg.Connection,
  profile: dict[str, Any],
  max_results: int = 40,
) -> list[dict[str, Any]]:
  api_key = google_places_api_key()
  if not api_key:
    return []

  anchors = _route_anchors(conn, profile)
  if not anchors:
    return []

  radius = max(150, int(settings.google_places_search_radius_meters))
  search_types = _search_types(profile)
  found_by_google_id: dict[str, dict[str, Any]] = {}

  try:
    with httpx.Client(timeout=6.0) as client:
      for center_lat, center_lng in anchors:
        for place_type in search_types:
          response = client.get(
            GOOGLE_NEARBY_SEARCH_URL,
            params={
              "key": api_key,
              "location": f"{center_lat:.6f},{center_lng:.6f}",
              "radius": radius,
              "type": place_type,
            },
          )
          if response.status_code != 200:
            continue

          payload = response.json()
          status = str(payload.get("status") or "")
          if status not in {"OK", "ZERO_RESULTS"}:
            continue

          for result in payload.get("results") or []:
            google_place_id = str(result.get("place_id") or "").strip()
            if not google_place_id:
              continue

            geometry = result.get("geometry") or {}
            location = geometry.get("location") or {}
            lat = location.get("lat")
            lng = location.get("lng")
            if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
              continue

            google_types = result.get("types")
            rating_raw = result.get("rating")
            price_level_raw = result.get("price_level")

            found_by_google_id[google_place_id] = {
              "google_place_id": google_place_id,
              "name": str(result.get("name") or "Suggested Place").strip(),
              "latitude": float(lat),
              "longitude": float(lng),
              "cell_id": convert_gps_to_cell(
                float(lat),
                float(lng),
                grid_size_meters=settings.grid_size_meters,
              ),
              "category": _coarse_category(google_types if isinstance(google_types, list) else []),
              "rating": float(rating_raw) if isinstance(rating_raw, (int, float)) else None,
              "price_level": int(price_level_raw) if isinstance(price_level_raw, int) else None,
              "is_partner": False,
            }
            if len(found_by_google_id) >= max_results:
              break

          if len(found_by_google_id) >= max_results:
            break
        if len(found_by_google_id) >= max_results:
          break
  except (httpx.HTTPError, ValueError):
    return []

  places = list(found_by_google_id.values())
  places.sort(key=lambda item: (item.get("rating") or 0.0), reverse=True)
  return places[:max_results]
