from __future__ import annotations

from collections import Counter
from datetime import date
from statistics import mean
from typing import Any

from .geo import cosine_similarity, time_window_from_hour


def _as_set(values: list[dict[str, Any]] | None, key: str) -> set[str]:
  if not values:
    return set()
  output: set[str] = set()
  for item in values:
    value = item.get(key)
    if value:
      output.add(str(value).lower())
  return output


def ordered_pair(user_a: str, user_b: str) -> tuple[str, str]:
  if user_a < user_b:
    return user_a, user_b
  return user_b, user_a


def _top_shared_categories(profile_a: dict[str, Any], profile_b: dict[str, Any]) -> list[str]:
  categories_a = _as_set(profile_a.get("frequent_place_categories"), "category") - {"general"}
  categories_b = _as_set(profile_b.get("frequent_place_categories"), "category") - {"general"}
  return sorted(categories_a & categories_b)


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
  return [name for name, _ in ranked[:3]] or ["daytime"]


def match_fit_explanation(
  scores: dict[str, float],
  profile_a: dict[str, Any],
  profile_b: dict[str, Any],
  interests_a: set[str] | None = None,
  interests_b: set[str] | None = None,
) -> str:
  shared_categories = _top_shared_categories(profile_a, profile_b)
  shared_interests = sorted((interests_a or set()) & (interests_b or set()))
  windows = _top_time_windows(profile_a)

  if shared_categories:
    category_phrase = ", ".join(shared_categories[:3])
    return (
      f"You align on {windows[0]} rhythm and frequently overlap in {category_phrase} lifestyle zones. "
      "This fit uses broad routine patterns, not exact live location."
    )

  if shared_interests:
    interest_phrase = ", ".join(shared_interests[:3])
    return (
      f"You share interest themes ({interest_phrase}) and similar weekly timing in {windows[0]} periods. "
      "Match quality comes from repeated pattern similarity, not precise coordinates."
    )

  if scores.get("lifestyle_similarity", 0.0) >= 0.55:
    return (
      "Your lifestyle pace is complementary: activity intensity and daypart habits fit well for low-friction planning. "
      "Only anonymized route summaries are compared."
    )

  return (
    "You are compatible on routine cadence with some complementary differences that can make plans more interesting. "
    "The system hides exact paths and timestamps by default."
  )


def new_people_discovery_note(profile_a: dict[str, Any], profile_b: dict[str, Any]) -> str:
  vec_a = {key: float(value) for key, value in (profile_a.get("lifestyle_vector") or {}).items()}
  vec_b = {key: float(value) for key, value in (profile_b.get("lifestyle_vector") or {}).items()}
  similarity = cosine_similarity(vec_a, vec_b)

  if not vec_a or not vec_b:
    return "This recommendation balances routine familiarity with new social context."

  most_different = sorted(
    vec_a.keys(),
    key=lambda key: abs(vec_a.get(key, 0.0) - vec_b.get(key, 0.0)),
    reverse=True,
  )
  diff_focus = ", ".join(most_different[:2])

  if similarity >= 0.7:
    return f"Strong rhythm match with small novelty from {diff_focus} preferences to keep plans fresh."

  if similarity >= 0.45:
    return f"Complementary profile: you share enough routine overlap, while {diff_focus} differences add variety."

  return f"High-complement recommendation: different {diff_focus} patterns can broaden your weekly social loop."


def safe_icebreakers(profile_a: dict[str, Any], profile_b: dict[str, Any]) -> list[str]:
  shared_categories = _top_shared_categories(profile_a, profile_b)
  category = shared_categories[0] if shared_categories else "weekend"
  return [
    f"What is one small win from your {category} routine this week?",
    "Would you prefer a short daytime meetup or a quick evening coffee first?",
    "What kind of public place helps you feel most comfortable for first meetings?",
  ]


def first_meet_activity_types(profile_a: dict[str, Any], profile_b: dict[str, Any]) -> list[str]:
  shared_categories = set(_top_shared_categories(profile_a, profile_b))
  options = [
    "Cafe check-in near a transit station",
    "Park walk in daylight",
    "Bookstore + coffee in a busy area",
    "Casual food court meet with easy exit",
  ]

  if "fitness" in shared_categories:
    options.insert(0, "Short public sports session (daytime)")
  if "nature" in shared_categories:
    options.insert(0, "Popular park loop during morning hours")
  return options[:4]


def _window_label(bucket: str, daypart: str) -> str:
  day = "Weekday" if bucket == "weekday" else "Weekend"
  slot = {
    "morning": "Morning (8am-11am)",
    "afternoon": "Afternoon (1pm-4pm)",
    "evening": "Early Evening (6pm-9pm)",
    "late-night": "Late Night (after 10pm)",
  }.get(daypart, "Daytime")
  return f"{day} · {slot}"


def weekly_social_windows(profile_a: dict[str, Any], profile_b: dict[str, Any], limit: int = 3) -> list[dict[str, Any]]:
  time_a = profile_a.get("time_pattern_vector") or {}
  time_b = profile_b.get("time_pattern_vector") or {}

  scores: list[tuple[str, str, float]] = []
  for bucket in ["weekday", "weekend"]:
    hours_a = {str(k): float(v) for k, v in (time_a.get(bucket) or {}).items()}
    hours_b = {str(k): float(v) for k, v in (time_b.get(bucket) or {}).items()}

    grouped: dict[str, float] = {"morning": 0.0, "afternoon": 0.0, "evening": 0.0, "late-night": 0.0}
    for hour in range(24):
      key = str(hour)
      overlap = min(hours_a.get(key, 0.0), hours_b.get(key, 0.0))
      grouped[time_window_from_hour(hour)] += overlap

    for daypart, value in grouped.items():
      scores.append((bucket, daypart, value))

  ranked = sorted(scores, key=lambda item: item[2], reverse=True)
  windows: list[dict[str, Any]] = []
  for bucket, daypart, score in ranked[:limit]:
    confidence = "high" if score >= 0.12 else "medium" if score >= 0.06 else "light"
    windows.append(
      {
        "label": _window_label(bucket, daypart),
        "bucket": bucket,
        "daypart": daypart,
        "confidence": confidence,
      }
    )

  if windows:
    return windows

  return [
    {"label": "Weekday · Afternoon (1pm-4pm)", "bucket": "weekday", "daypart": "afternoon", "confidence": "light"},
    {"label": "Weekend · Morning (8am-11am)", "bucket": "weekend", "daypart": "morning", "confidence": "light"},
  ]


def place_scout_suggestions(
  profile_a: dict[str, Any],
  profile_b: dict[str, Any],
  places: list[dict[str, Any]],
  budget: str | None = None,
  vibe: str | None = None,
  limit: int = 4,
) -> list[dict[str, Any]]:
  cats = set(_top_shared_categories(profile_a, profile_b))
  if not cats:
    cats = {"cafe", "food", "nature"}

  budget_pref = (budget or "mid").lower()
  vibe_pref = (vibe or "casual").lower()

  ranked: list[dict[str, Any]] = []
  for place in places:
    category = str(place.get("category") or "local").lower()
    rating = float(place.get("rating") or 0.0)
    price_level = int(place.get("price_level") or 1)

    score = 0.15
    if category in cats:
      score += 0.45
    score += min(0.2, rating / 25.0)

    if budget_pref == "budget" and price_level <= 1:
      score += 0.15
    elif budget_pref == "mid" and price_level <= 2:
      score += 0.12
    elif budget_pref == "premium" and price_level >= 2:
      score += 0.1

    if vibe_pref in {"quiet", "calm"} and category in {"cafe", "nature"}:
      score += 0.08
    if vibe_pref in {"active", "energetic"} and category in {"fitness", "food"}:
      score += 0.08

    reason = f"Good overlap on {category} preference, public setting, and easy first-meet format."
    ranked.append(
      {
        "name": place.get("name") or "Suggested place",
        "category": category,
        "rating": rating or None,
        "price_level": price_level,
        "reason": reason,
        "score": round(min(score, 1.0), 4),
      }
    )

  ranked.sort(key=lambda item: item["score"], reverse=True)
  return ranked[:limit]


def routine_mirror_summary(
  profile: dict[str, Any] | None,
  daily_routes: list[dict[str, Any]],
  location_logs: list[dict[str, Any]],
) -> dict[str, Any]:
  if not profile:
    return {
      "weekly_summary": "Not enough processed routine data yet. Recompute to generate your Routine Mirror.",
      "habit_highlights": [],
      "energy_pattern": ["No strong time-band signal yet."],
      "routine_drift_alerts": [],
    }

  categories = [
    str(item.get("category"))
    for item in (profile.get("frequent_place_categories") or [])
    if item.get("category") and item.get("category") != "general"
  ]
  top_categories = categories[:3]

  recent = sorted(daily_routes, key=lambda row: row.get("date") or date.min)
  last_14 = recent[-14:]
  latest_7 = last_14[-7:]
  previous_7 = last_14[:-7]

  latest_minutes = [float(row.get("active_minutes") or 0.0) for row in latest_7]
  previous_minutes = [float(row.get("active_minutes") or 0.0) for row in previous_7]

  avg_latest = mean(latest_minutes) if latest_minutes else 0.0
  avg_previous = mean(previous_minutes) if previous_minutes else 0.0

  drift_alerts: list[str] = []
  if avg_previous > 0:
    change = (avg_latest - avg_previous) / avg_previous
    if change <= -0.25:
      drift_alerts.append("Active-time dropped by more than 25% versus the previous week.")
    elif change >= 0.3:
      drift_alerts.append("Activity intensity spiked more than 30% versus the previous week.")

  hour_counter: Counter[int] = Counter()
  for log in location_logs[-400:]:
    timestamp = log.get("timestamp")
    if hasattr(timestamp, "hour"):
      hour_counter[int(timestamp.hour)] += 1

  top_hours = [hour for hour, _ in hour_counter.most_common(2)]
  energy_lines = []
  for hour in top_hours:
    energy_lines.append(f"High movement tendency around {hour:02d}:00 ({time_window_from_hour(hour)}).")
  if not energy_lines:
    energy_lines.append("Energy pattern still stabilizing. Keep tracking for a fuller weekly readout.")

  highlights = []
  for category in top_categories:
    highlights.append(f"Consistent {category} behavior this week.")
  if avg_latest:
    highlights.append(f"Average active routine time: {avg_latest:.0f} minutes/day.")

  summary = "Routine Mirror detected steady habits"
  if top_categories:
    summary += f" centered on {', '.join(top_categories[:2])}"
  summary += "."

  return {
    "weekly_summary": summary,
    "habit_highlights": highlights[:4],
    "energy_pattern": energy_lines,
    "routine_drift_alerts": drift_alerts,
  }


def answer_routine_followup(question: str, mirror_payload: dict[str, Any]) -> str:
  prompt = question.lower()

  if "drift" in prompt or "change" in prompt:
    alerts = mirror_payload.get("routine_drift_alerts") or []
    if alerts:
      return f"Main drift signal: {alerts[0]} Try lighter, repeatable plans in your strongest time window for recovery."
    return "No major drift was detected this week. Keep a consistent baseline and re-check after 7 days."

  if "energy" in prompt or "tired" in prompt:
    pattern = mirror_payload.get("energy_pattern") or []
    return pattern[0] if pattern else "Energy signal is still weak; more logs will improve this." 

  if "habit" in prompt or "improve" in prompt:
    highlights = mirror_payload.get("habit_highlights") or []
    if highlights:
      return f"Top habit signal: {highlights[0]} You can improve consistency by planning one anchor activity in that category."
    return "Start with one repeated weekday activity and one weekend activity to build baseline habits."

  return (
    "Routine Mirror can explain drift, energy windows, and habit consistency. "
    "Ask about one category or one week-to-week change for a focused answer."
  )


def answer_match_followup(question: str, context: dict[str, Any]) -> str:
  prompt = question.lower()

  if "why" in prompt or "fit" in prompt:
    return context.get("fit_explanation") or "Your fit is based on routine timing and broad area overlap."

  if "icebreaker" in prompt or "start" in prompt:
    icebreakers = context.get("safe_icebreakers") or []
    return icebreakers[0] if icebreakers else "Start with a low-pressure question about weekday vs weekend preferences."

  if "meet" in prompt or "plan" in prompt:
    activities = context.get("first_meet_activities") or []
    if activities:
      return f"Recommended first meet: {activities[0]}. Keep it public, daytime, and easy to leave."
    return "Choose a public daytime place near transit as the safest first meet setup."

  if "different" in prompt or "complement" in prompt:
    return context.get("discovery_note") or "The system intentionally includes complementary lifestyle differences, not only similar profiles."

  return (
    "You can ask why the match is compatible, request safer opening lines, or ask for first-meet plan types."
  )


def evaluate_safety_message(body: str) -> dict[str, Any]:
  text = (body or "").strip().lower()
  if not text:
    return {"flagged": False, "reason": None, "alternatives": []}

  risky_signals = [
    (["my place", "private place", "come over", "hotel"], "Private-location pressure before trust"),
    (["midnight", "2am", "late night", "after 11"], "Very late meetup timing"),
    (["don't tell", "secret", "just us"], "Secrecy request"),
    (["send money", "paynow", "transfer"], "Money request signal"),
    (["explicit", "nudes", "sexual"], "Sexual escalation signal"),
  ]

  hits: list[str] = []
  for keywords, label in risky_signals:
    if any(keyword in text for keyword in keywords):
      hits.append(label)

  if not hits:
    return {"flagged": False, "reason": None, "alternatives": []}

  alternatives = [
    "Suggest a public venue with visible foot traffic.",
    "Prefer daytime or early evening time windows.",
    "Share meetup details with a trusted contact.",
    "Use places near transit with easy exit options.",
  ]

  reason = "; ".join(hits[:2])
  return {"flagged": True, "reason": reason, "alternatives": alternatives}
