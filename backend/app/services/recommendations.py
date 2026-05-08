from __future__ import annotations

from typing import Any


def _top_route_cells(profile: dict[str, Any], limit: int = 8) -> list[str]:
  frequent = profile.get("frequent_cells") or []
  cells: list[str] = []
  for item in frequent:
    cell_id = item.get("cell_id")
    if cell_id:
      cells.append(cell_id)
  return cells[:limit]


def _top_categories(profile: dict[str, Any], limit: int = 4) -> list[str]:
  values = profile.get("frequent_place_categories") or []
  categories: list[str] = []
  for item in values:
    category = item.get("category")
    if category and category != "general":
      categories.append(category)
  return categories[:limit]


def _time_hint(profile: dict[str, Any]) -> str:
  vector = profile.get("time_pattern_vector") or {}
  buckets = vector.get("weekday") or {}
  if not buckets:
    return "your usual route"

  top_hour = max(buckets.items(), key=lambda item: item[1])[0]
  try:
    hour = int(top_hour)
  except ValueError:
    return "your usual route"

  if 5 <= hour < 11:
    return "your morning route"
  if 11 <= hour < 17:
    return "your midday route"
  if 17 <= hour < 22:
    return "your evening route"
  return "your late-night route"


def generate_recommendations(
  profile: dict[str, Any],
  places: list[dict[str, Any]],
  visited_place_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
  visited = visited_place_ids or set()
  route_cells = set(_top_route_cells(profile))
  categories = set(_top_categories(profile))
  time_hint = _time_hint(profile)

  ranked: list[dict[str, Any]] = []
  for place in places:
    place_id = str(place["place_id"])
    if place_id in visited:
      continue

    score = 0.25
    if place.get("cell_id") in route_cells:
      score += 0.45
    if place.get("category") in categories:
      score += 0.2
    if place.get("is_partner"):
      score += 0.05

    rating = place.get("rating")
    if isinstance(rating, (int, float)):
      score += min(0.05, float(rating) / 100.0)

    category = place.get("category") or "local"
    reason = f"You often pass similar {category} areas near {time_hint}, but this spot is likely underexplored."

    ranked.append(
      {
        "place_id": place_id,
        "reason": reason,
        "score": round(min(1.0, score), 4),
      }
    )

  ranked.sort(key=lambda item: item["score"], reverse=True)
  return ranked[:12]
