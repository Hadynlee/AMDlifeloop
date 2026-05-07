import math
from typing import Iterable, Sequence

EARTH_RADIUS_M = 6378137.0
WEB_MERCATOR_LIMIT = 20037508.342789244


def convert_gps_to_cell(lat: float, lng: float, grid_size_meters: int = 300, prefix: str = "CELL") -> str:
  """Convert exact GPS into a stable approximate grid cell id."""
  lat_clamped = max(min(lat, 85.0), -85.0)
  lng_wrapped = ((lng + 180.0) % 360.0) - 180.0

  x_m = math.radians(lng_wrapped) * EARTH_RADIUS_M
  y_m = math.log(math.tan(math.pi / 4.0 + math.radians(lat_clamped) / 2.0)) * EARTH_RADIUS_M

  x_idx = math.floor((x_m + WEB_MERCATOR_LIMIT) / grid_size_meters)
  y_idx = math.floor((y_m + WEB_MERCATOR_LIMIT) / grid_size_meters)
  return f"{prefix}_{x_idx}_{y_idx}"


def cell_id_to_center(cell_id: str, grid_size_meters: int = 300) -> tuple[float, float] | None:
  """Get an approximate center point for a cell id."""
  try:
    _, x_idx_raw, y_idx_raw = cell_id.split("_", 2)
    x_idx = int(x_idx_raw)
    y_idx = int(y_idx_raw)
  except (ValueError, TypeError):
    return None

  x_m = (x_idx + 0.5) * grid_size_meters - WEB_MERCATOR_LIMIT
  y_m = (y_idx + 0.5) * grid_size_meters - WEB_MERCATOR_LIMIT

  lng = math.degrees(x_m / EARTH_RADIUS_M)
  lat = math.degrees(2.0 * math.atan(math.exp(y_m / EARTH_RADIUS_M)) - math.pi / 2.0)
  return lat, lng


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
  d_lat = math.radians(lat2 - lat1)
  d_lng = math.radians(lng2 - lng1)
  a = (
    math.sin(d_lat / 2.0) ** 2
    + math.cos(math.radians(lat1))
    * math.cos(math.radians(lat2))
    * math.sin(d_lng / 2.0) ** 2
  )
  return 2.0 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def compress_route(cell_sequence: Sequence[str]) -> list[str]:
  compressed: list[str] = []
  for cell in cell_sequence:
    if not cell:
      continue
    if not compressed or compressed[-1] != cell:
      compressed.append(cell)
  return compressed


def jaccard_similarity(set_a: set[str], set_b: set[str]) -> float:
  if not set_a and not set_b:
    return 1.0
  if not set_a or not set_b:
    return 0.0
  union = set_a | set_b
  if not union:
    return 0.0
  return len(set_a & set_b) / len(union)


def cosine_similarity(vec_a: dict[str, float], vec_b: dict[str, float]) -> float:
  keys = set(vec_a) | set(vec_b)
  if not keys:
    return 0.0
  dot = sum(vec_a.get(k, 0.0) * vec_b.get(k, 0.0) for k in keys)
  mag_a = math.sqrt(sum((vec_a.get(k, 0.0) ** 2) for k in keys))
  mag_b = math.sqrt(sum((vec_b.get(k, 0.0) ** 2) for k in keys))
  if mag_a == 0 or mag_b == 0:
    return 0.0
  return max(0.0, min(1.0, dot / (mag_a * mag_b)))


def vector_from_hours(hours: Iterable[int]) -> dict[str, float]:
  buckets = [0] * 24
  for hour in hours:
    if 0 <= hour < 24:
      buckets[hour] += 1

  total = sum(buckets)
  if total == 0:
    total = 1
  return {str(i): buckets[i] / total for i in range(24)}


def time_window_from_hour(hour: int) -> str:
  if 5 <= hour < 11:
    return "morning"
  if 11 <= hour < 17:
    return "afternoon"
  if 17 <= hour < 22:
    return "evening"
  return "late-night"


def coarse_place_category(raw: str | None) -> str:
  if not raw:
    return "general"
  normalized = raw.lower()

  if "walk" in normalized or "run" in normalized or "gym" in normalized or "sport" in normalized:
    return "fitness"
  if "coffee" in normalized or "cafe" in normalized:
    return "cafe"
  if "food" in normalized or "meal" in normalized or "restaurant" in normalized:
    return "food"
  if "bike" in normalized or "transit" in normalized or "drive" in normalized or "commute" in normalized:
    return "commute"
  if "work" in normalized or "office" in normalized or "study" in normalized or "school" in normalized:
    return "campus"
  if "park" in normalized or "nature" in normalized:
    return "nature"
  return "general"
