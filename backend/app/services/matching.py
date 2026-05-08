from __future__ import annotations

from typing import Any

from .geo import cosine_similarity, jaccard_similarity, time_window_from_hour


def _as_set(values: list[dict[str, Any]] | None, key: str) -> set[str]:
  if not values:
    return set()
  result: set[str] = set()
  for item in values:
    value = item.get(key)
    if value:
      result.add(str(value))
  return result


def time_pattern_similarity(vector_a: dict[str, Any], vector_b: dict[str, Any]) -> float:
  weekday_a = {key: float(value) for key, value in (vector_a.get("weekday") or {}).items()}
  weekday_b = {key: float(value) for key, value in (vector_b.get("weekday") or {}).items()}
  weekend_a = {key: float(value) for key, value in (vector_a.get("weekend") or {}).items()}
  weekend_b = {key: float(value) for key, value in (vector_b.get("weekend") or {}).items()}

  weekday_score = cosine_similarity(weekday_a, weekday_b)
  weekend_score = cosine_similarity(weekend_a, weekend_b)
  return round((weekday_score * 0.7) + (weekend_score * 0.3), 4)


def lifestyle_similarity(vector_a: dict[str, float], vector_b: dict[str, float]) -> float:
  vec_a = {key: float(value) for key, value in (vector_a or {}).items()}
  vec_b = {key: float(value) for key, value in (vector_b or {}).items()}
  return round(cosine_similarity(vec_a, vec_b), 4)


def calculate_match_score(
  user_a_profile: dict[str, Any],
  user_b_profile: dict[str, Any],
  user_a_interests: set[str] | None = None,
  user_b_interests: set[str] | None = None,
) -> dict[str, float]:
  cells_a = _as_set(user_a_profile.get("frequent_cells"), "cell_id")
  cells_b = _as_set(user_b_profile.get("frequent_cells"), "cell_id")
  routes_a = _as_set(user_a_profile.get("common_routes"), "route")
  routes_b = _as_set(user_b_profile.get("common_routes"), "route")
  categories_a = _as_set(user_a_profile.get("frequent_place_categories"), "category")
  categories_b = _as_set(user_b_profile.get("frequent_place_categories"), "category")

  route_similarity = (jaccard_similarity(cells_a, cells_b) * 0.7) + (jaccard_similarity(routes_a, routes_b) * 0.3)
  time_similarity = time_pattern_similarity(
    user_a_profile.get("time_pattern_vector") or {},
    user_b_profile.get("time_pattern_vector") or {},
  )
  place_similarity = jaccard_similarity(categories_a, categories_b)
  lifestyle_sim = lifestyle_similarity(
    user_a_profile.get("lifestyle_vector") or {},
    user_b_profile.get("lifestyle_vector") or {},
  )
  interest_similarity = jaccard_similarity(user_a_interests or set(), user_b_interests or set())

  final_score = (
    0.35 * route_similarity
    + 0.25 * time_similarity
    + 0.20 * place_similarity
    + 0.10 * lifestyle_sim
    + 0.10 * interest_similarity
  )

  return {
    "route_similarity": round(route_similarity, 4),
    "time_similarity": round(time_similarity, 4),
    "place_similarity": round(place_similarity, 4),
    "lifestyle_similarity": round(lifestyle_sim, 4),
    "interest_similarity": round(interest_similarity, 4),
    "final_score": round(max(0.0, min(1.0, final_score)), 4),
  }


def _top_time_windows(profile: dict[str, Any]) -> list[str]:
  windows: dict[str, float] = {}
  time_vector = profile.get("time_pattern_vector") or {}

  for bucket in ["weekday", "weekend"]:
    source = time_vector.get(bucket) or {}
    for hour_raw, score in source.items():
      try:
        hour = int(hour_raw)
      except (TypeError, ValueError):
        continue
      label = time_window_from_hour(hour)
      windows[label] = windows.get(label, 0.0) + float(score)

  ranked = sorted(windows.items(), key=lambda item: item[1], reverse=True)
  return [label for label, _ in ranked[:2]] or ["daytime"]


def generate_privacy_safe_explanation(scores: dict[str, float], profiles: tuple[dict[str, Any], dict[str, Any]]) -> str:
  profile_a, profile_b = profiles
  categories_a = _as_set(profile_a.get("frequent_place_categories"), "category")
  categories_b = _as_set(profile_b.get("frequent_place_categories"), "category")
  shared_categories = sorted((categories_a & categories_b) - {"general"})

  time_windows = _top_time_windows(profile_a)
  time_phrase = " and ".join(time_windows[:2])

  if shared_categories:
    category_phrase = ", ".join(shared_categories[:3])
    return (
      f"You both show similar {time_phrase} routines around {category_phrase} areas. "
      "Exact locations and precise timestamps are hidden for safety."
    )

  if scores.get("route_similarity", 0.0) >= 0.5:
    return (
      f"You both have comparable movement loops during {time_phrase}. "
      "Only approximate area patterns are used, not exact paths or live location."
    )

  return (
    f"Your routine rhythm is moderately aligned in {time_phrase} periods. "
    "Matching uses anonymized routine patterns and broad categories only."
  )
