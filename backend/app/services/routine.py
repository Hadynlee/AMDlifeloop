from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
from statistics import mean
from typing import Any

from .geo import (
  compress_route,
  convert_gps_to_cell,
  coarse_place_category,
  haversine_meters,
  jaccard_similarity,
  vector_from_hours,
)


@dataclass
class DailyRouteResult:
  route_date: date
  compressed_route: list[str]
  main_loop: list[str]
  total_distance_meters: float
  active_minutes: float
  routine_score: float


def _ensure_datetime(value: datetime | str) -> datetime:
  if isinstance(value, datetime):
    return value
  cleaned = value.replace("Z", "+00:00") if isinstance(value, str) else value
  return datetime.fromisoformat(cleaned)


def detect_stay_points(
  location_logs: list[dict[str, Any]],
  radius_meters: float = 150.0,
  min_duration_minutes: float = 15.0,
  grid_size_meters: int = 300,
) -> list[dict[str, Any]]:
  if not location_logs:
    return []

  logs = sorted(location_logs, key=lambda item: _ensure_datetime(item["timestamp"]))
  stays: list[dict[str, Any]] = []
  i = 0

  while i < len(logs):
    cluster: list[dict[str, Any]] = [logs[i]]
    centroid_lat = float(logs[i]["latitude"])
    centroid_lng = float(logs[i]["longitude"])

    j = i + 1
    while j < len(logs):
      candidate = logs[j]
      distance = haversine_meters(
        centroid_lat,
        centroid_lng,
        float(candidate["latitude"]),
        float(candidate["longitude"]),
      )

      if distance > radius_meters:
        break

      cluster.append(candidate)
      centroid_lat = sum(float(item["latitude"]) for item in cluster) / len(cluster)
      centroid_lng = sum(float(item["longitude"]) for item in cluster) / len(cluster)
      j += 1

    start_time = _ensure_datetime(cluster[0]["timestamp"])
    end_time = _ensure_datetime(cluster[-1]["timestamp"])
    duration_minutes = max(0.0, (end_time - start_time).total_seconds() / 60.0)

    if duration_minutes >= min_duration_minutes:
      cells = [item.get("cell_id") for item in cluster if item.get("cell_id")]
      cell_id = Counter(cells).most_common(1)[0][0] if cells else convert_gps_to_cell(
        centroid_lat,
        centroid_lng,
        grid_size_meters=grid_size_meters,
      )
      category = coarse_place_category(cluster[0].get("activity_type"))
      confidence = min(0.99, 0.55 + (duration_minutes / 180.0))

      stays.append(
        {
          "start_time": start_time,
          "end_time": end_time,
          "duration_minutes": round(duration_minutes, 2),
          "cell_id": cell_id,
          "centroid_lat": centroid_lat,
          "centroid_lng": centroid_lng,
          "place_category": category,
          "confidence_score": round(confidence, 3),
        }
      )

    i = max(i + 1, j)

  return stays


def build_daily_route_from_logs(logs_for_day: list[dict[str, Any]], route_date: date) -> DailyRouteResult | None:
  if not logs_for_day:
    return None

  ordered = sorted(logs_for_day, key=lambda item: _ensure_datetime(item["timestamp"]))
  cell_sequence = [item.get("cell_id") for item in ordered if item.get("cell_id")]
  compressed = compress_route(cell_sequence)

  total_distance = 0.0
  for idx in range(1, len(ordered)):
    total_distance += haversine_meters(
      float(ordered[idx - 1]["latitude"]),
      float(ordered[idx - 1]["longitude"]),
      float(ordered[idx]["latitude"]),
      float(ordered[idx]["longitude"]),
    )

  start_time = _ensure_datetime(ordered[0]["timestamp"])
  end_time = _ensure_datetime(ordered[-1]["timestamp"])
  active_minutes = max(0.0, (end_time - start_time).total_seconds() / 60.0)

  unique_cells = len(set(compressed))
  repetition_ratio = 0.0 if not compressed else 1.0 - min(1.0, unique_cells / max(1, len(compressed)))
  route_density = min(1.0, len(compressed) / 12.0)
  routine_score = round((repetition_ratio * 0.7 + route_density * 0.3), 3)

  return DailyRouteResult(
    route_date=route_date,
    compressed_route=compressed,
    main_loop=compressed[:6],
    total_distance_meters=round(total_distance, 2),
    active_minutes=round(active_minutes, 2),
    routine_score=routine_score,
  )


def build_route_segments_from_logs(logs_for_day: list[dict[str, Any]]) -> list[dict[str, Any]]:
  if len(logs_for_day) < 2:
    return []

  ordered = sorted(logs_for_day, key=lambda item: _ensure_datetime(item["timestamp"]))
  segments: list[dict[str, Any]] = []
  current_cells: list[str] = []
  segment_start_idx = 0

  for idx, item in enumerate(ordered):
    cell = item.get("cell_id")
    if not cell:
      continue
    if not current_cells:
      current_cells.append(cell)
      segment_start_idx = idx
      continue
    if cell != current_cells[-1]:
      current_cells.append(cell)

    if len(current_cells) >= 4 or idx == len(ordered) - 1:
      start_item = ordered[segment_start_idx]
      end_item = item
      distance = 0.0
      for hop_idx in range(segment_start_idx + 1, idx + 1):
        distance += haversine_meters(
          float(ordered[hop_idx - 1]["latitude"]),
          float(ordered[hop_idx - 1]["longitude"]),
          float(ordered[hop_idx]["latitude"]),
          float(ordered[hop_idx]["longitude"]),
        )

      start_dt = _ensure_datetime(start_item["timestamp"])
      end_dt = _ensure_datetime(end_item["timestamp"])
      duration = max(0.0, (end_dt - start_dt).total_seconds() / 60.0)

      segments.append(
        {
          "start_time": start_dt,
          "end_time": end_dt,
          "start_cell_id": current_cells[0],
          "end_cell_id": current_cells[-1],
          "cell_sequence": compress_route(current_cells),
          "transport_mode": "walk" if duration and distance / max(duration, 1) < 90 else "transit",
          "distance_meters": round(distance, 2),
          "duration_minutes": round(duration, 2),
        }
      )

      current_cells = [cell]
      segment_start_idx = idx

  return segments


def build_routine_profile(
  user_id: str,
  period_start: date,
  period_end: date,
  daily_routes: list[dict[str, Any]],
  stay_points: list[dict[str, Any]],
  location_logs: list[dict[str, Any]],
) -> dict[str, Any]:
  frequent_cells_counter: Counter[str] = Counter()
  route_counter: Counter[str] = Counter()
  route_sets: list[set[str]] = []

  for route in daily_routes:
    compressed = route.get("compressed_route") or []
    if isinstance(compressed, str):
      compressed = []
    frequent_cells_counter.update(compressed)
    if compressed:
      route_counter.update([" > ".join(compressed[:6])])
      route_sets.append(set(compressed))

  frequent_cells = [{"cell_id": cell, "count": count} for cell, count in frequent_cells_counter.most_common(12)]
  common_routes = [{"route": route, "count": count} for route, count in route_counter.most_common(8)]

  place_counter: Counter[str] = Counter()
  for stay in stay_points:
    category = stay.get("place_category") or "general"
    place_counter.update([category])

  frequent_categories = [
    {"category": category, "count": count} for category, count in place_counter.most_common(10)
  ]

  weekday_hours = [
    _ensure_datetime(item["timestamp"]).hour
    for item in location_logs
    if _ensure_datetime(item["timestamp"]).weekday() < 5
  ]
  weekend_hours = [
    _ensure_datetime(item["timestamp"]).hour
    for item in location_logs
    if _ensure_datetime(item["timestamp"]).weekday() >= 5
  ]

  time_pattern_vector = {
    "weekday": vector_from_hours(weekday_hours),
    "weekend": vector_from_hours(weekend_hours),
  }

  lifestyle_keys = ["campus", "sports", "cafe", "nightlife", "nature", "shopping", "food", "fitness", "commute"]
  lifestyle_vector = {key: 0.05 for key in lifestyle_keys}
  total_places = sum(place_counter.values()) or 1

  category_to_lifestyle = {
    "campus": "campus",
    "fitness": "fitness",
    "cafe": "cafe",
    "food": "food",
    "nature": "nature",
    "commute": "commute",
  }

  for category, count in place_counter.items():
    mapped = category_to_lifestyle.get(category)
    if mapped:
      lifestyle_vector[mapped] = min(1.0, lifestyle_vector[mapped] + count / total_places)

  if lifestyle_vector.get("fitness", 0.0) > 0.35:
    lifestyle_vector["sports"] = min(1.0, lifestyle_vector["fitness"] * 0.92)

  stability_components: list[float] = []
  for idx in range(1, len(route_sets)):
    stability_components.append(jaccard_similarity(route_sets[idx - 1], route_sets[idx]))
  routine_stability = round(mean(stability_components), 3) if stability_components else 0.0

  return {
    "user_id": user_id,
    "period_start": period_start,
    "period_end": period_end,
    "frequent_cells": frequent_cells,
    "frequent_place_categories": frequent_categories,
    "common_routes": common_routes,
    "time_pattern_vector": time_pattern_vector,
    "lifestyle_vector": lifestyle_vector,
    "routine_stability": routine_stability,
  }
