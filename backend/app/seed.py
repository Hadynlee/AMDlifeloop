from __future__ import annotations

import argparse
import random
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from psycopg.types.json import Json

from app.config import settings
from app.db import connect, run_migrations
from app.services.geo import convert_gps_to_cell
from app.services.matching import calculate_match_score, generate_privacy_safe_explanation
from app.services.recommendations import generate_recommendations
from app.services.routine import (
  build_daily_route_from_logs,
  build_route_segments_from_logs,
  build_routine_profile,
  detect_stay_points,
)


USER_BLUEPRINTS = [
  {
    "name": "Jia Hong",
    "email": "jia@example.com",
    "interests": ["badminton", "cafe-hopping", "food"],
    "weekday_stops": [
      ("campus", 1.3527, 103.8192, "study", time(8, 30), 150),
      ("transit", 1.3388, 103.8285, "commute", time(11, 30), 30),
      ("sports", 1.3345, 103.8110, "sports", time(19, 0), 90),
      ("food", 1.3188, 103.8318, "food", time(21, 0), 45),
    ],
    "weekend_stops": [
      ("cafe", 1.3135, 103.8474, "cafe", time(11, 0), 120),
      ("park", 1.3070, 103.8322, "walk", time(16, 0), 90),
    ],
  },
  {
    "name": "Mei Lin",
    "email": "mei@example.com",
    "interests": ["books", "arts", "coffee"],
    "weekday_stops": [
      ("campus", 1.2966, 103.7764, "study", time(10, 0), 180),
      ("cafe", 1.3008, 103.7885, "cafe", time(14, 0), 120),
      ("arts", 1.2951, 103.8540, "museum", time(19, 0), 75),
    ],
    "weekend_stops": [
      ("cafe", 1.3032, 103.8310, "cafe", time(10, 30), 130),
      ("arts", 1.2904, 103.8521, "gallery", time(15, 30), 120),
    ],
  },
  {
    "name": "Arjun",
    "email": "arjun@example.com",
    "interests": ["gym", "dinner", "running"],
    "weekday_stops": [
      ("office", 1.2838, 103.8506, "work", time(9, 0), 480),
      ("gym", 1.2998, 103.8580, "gym", time(18, 45), 80),
      ("food", 1.3060, 103.8350, "food", time(20, 20), 60),
    ],
    "weekend_stops": [
      ("gym", 1.3018, 103.8522, "run", time(9, 30), 90),
      ("food", 1.3098, 103.8604, "food", time(12, 30), 80),
    ],
  },
  {
    "name": "Sara",
    "email": "sara@example.com",
    "interests": ["walking", "nature", "brunch"],
    "weekday_stops": [
      ("home", 1.3640, 103.8280, "home", time(7, 0), 60),
      ("park", 1.3508, 103.8222, "walk", time(7, 45), 70),
      ("food", 1.3392, 103.8358, "brunch", time(12, 10), 65),
    ],
    "weekend_stops": [
      ("park", 1.3475, 103.8150, "nature", time(8, 45), 110),
      ("food", 1.3328, 103.8420, "brunch", time(11, 45), 120),
      ("cafe", 1.3266, 103.8528, "cafe", time(16, 0), 90),
    ],
  },
  {
    "name": "Noah Tan",
    "email": "noah@example.com",
    "interests": ["coding", "night-food", "board-games"],
    "weekday_stops": [
      ("office", 1.2860, 103.8520, "work", time(9, 30), 470),
      ("cafe", 1.2988, 103.8395, "cafe", time(18, 30), 70),
      ("food", 1.3055, 103.8568, "food", time(20, 0), 65),
    ],
    "weekend_stops": [
      ("games", 1.3215, 103.8612, "hobby", time(14, 0), 150),
      ("food", 1.3130, 103.8488, "food", time(18, 30), 75),
    ],
  },
  {
    "name": "Priya Das",
    "email": "priya@example.com",
    "interests": ["yoga", "brunch", "reading"],
    "weekday_stops": [
      ("home", 1.3360, 103.7980, "home", time(6, 45), 55),
      ("park", 1.3335, 103.8091, "yoga", time(7, 45), 75),
      ("office", 1.2942, 103.8501, "work", time(10, 0), 430),
      ("food", 1.3046, 103.8330, "dinner", time(19, 10), 70),
    ],
    "weekend_stops": [
      ("park", 1.3432, 103.8160, "walk", time(8, 30), 95),
      ("cafe", 1.3202, 103.8424, "brunch", time(11, 30), 110),
      ("library", 1.2960, 103.8528, "reading", time(16, 30), 90),
    ],
  },
  {
    "name": "Ethan Lim",
    "email": "ethan@example.com",
    "interests": ["cycling", "hawker", "photography"],
    "weekday_stops": [
      ("office", 1.2798, 103.8480, "work", time(9, 15), 500),
      ("cycling", 1.3062, 103.8544, "ride", time(18, 55), 80),
      ("food", 1.3128, 103.8698, "food", time(20, 40), 55),
    ],
    "weekend_stops": [
      ("park", 1.2992, 103.8120, "cycling", time(8, 0), 150),
      ("cafe", 1.3088, 103.8362, "photo", time(14, 30), 85),
    ],
  },
  {
    "name": "Hana Lee",
    "email": "hana@example.com",
    "interests": ["dance", "cafes", "desserts"],
    "weekday_stops": [
      ("campus", 1.3020, 103.7732, "study", time(10, 0), 210),
      ("studio", 1.3132, 103.8438, "dance", time(18, 20), 95),
      ("food", 1.3208, 103.8554, "dessert", time(20, 30), 60),
    ],
    "weekend_stops": [
      ("cafe", 1.3042, 103.8300, "cafe", time(11, 0), 125),
      ("arts", 1.2900, 103.8530, "arts", time(16, 0), 100),
    ],
  },
]


PLACE_SEEDS = [
  ("Route Brew Cafe", 1.3136, 103.8468, "cafe", 4.4, 2, True),
  ("Evening Noodle House", 1.3182, 103.8324, "food", 4.3, 1, False),
  ("Loop Fitness Studio", 1.3000, 103.8584, "fitness", 4.6, 2, True),
  ("Greenline Park Hub", 1.3470, 103.8186, "nature", 4.2, 0, False),
  ("Campus Commons Coffee", 1.3521, 103.8198, "cafe", 4.5, 1, True),
  ("Transit Bites Bar", 1.3383, 103.8291, "food", 4.1, 1, False),
  ("Gallery Roast", 1.2922, 103.8535, "cafe", 4.5, 2, False),
  ("Marina Motion Gym", 1.2845, 103.8518, "fitness", 4.7, 3, True),
  ("Sunlit Brunch Hall", 1.3205, 103.8426, "food", 4.4, 2, False),
  ("City Boardgame Loft", 1.3212, 103.8610, "cafe", 4.3, 2, False),
  ("Riverside Walk Commons", 1.3045, 103.8325, "nature", 4.6, 0, False),
  ("Urban Cycle Stop", 1.3068, 103.8542, "fitness", 4.5, 1, True),
  ("Quiet Shelf Cafe", 1.2962, 103.8525, "cafe", 4.4, 2, False),
  ("Transit Square Food Hub", 1.3131, 103.8490, "food", 4.2, 1, True),
  ("Open Lawn Activity Park", 1.3430, 103.8162, "nature", 4.3, 0, False),
  ("Studio Steps Coffee", 1.3134, 103.8440, "cafe", 4.2, 2, False),
  ("Harbor Evenings Kitchen", 1.3085, 103.8360, "food", 4.4, 2, True),
  ("Neighborhood Dessert Lab", 1.3209, 103.8552, "food", 4.5, 2, False),
]


def _rand_jitter(value: float, meter_scale: float = 90.0) -> float:
  # Approx 111_320m per latitude degree.
  return value + random.uniform(-meter_scale / 111_320.0, meter_scale / 111_320.0)


def _generate_logs_for_user(
  user_id: str,
  weekday_stops: list[tuple[str, float, float, str, time, int]],
  weekend_stops: list[tuple[str, float, float, str, time, int]],
  days: int,
) -> list[dict[str, Any]]:
  now = datetime.now(timezone.utc)
  logs: list[dict[str, Any]] = []

  for day_offset in range(days, 0, -1):
    day = (now - timedelta(days=day_offset)).date()
    stops = weekday_stops if day.weekday() < 5 else weekend_stops

    for stop_name, base_lat, base_lng, activity, start_clock, duration_mins in stops:
      start_dt = datetime.combine(day, start_clock, tzinfo=timezone.utc)
      interval = 5
      if duration_mins > 240:
        interval = 15

      for minute in range(0, duration_mins + 1, interval):
        timestamp = start_dt + timedelta(minutes=minute)
        lat = _rand_jitter(base_lat, meter_scale=65.0)
        lng = _rand_jitter(base_lng, meter_scale=65.0)
        logs.append(
          {
            "user_id": user_id,
            "timestamp": timestamp,
            "latitude": lat,
            "longitude": lng,
            "accuracy_meters": random.uniform(12.0, 45.0),
            "speed_mps": random.uniform(0.0, 1.4),
            "activity_type": f"{activity}:{stop_name}",
          }
        )

  logs.sort(key=lambda item: item["timestamp"])
  return logs


def _ensure_user(conn, name: str, email: str) -> str:
  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO users (name, email)
      VALUES (%s, %s)
      ON CONFLICT (email)
      DO UPDATE SET name = EXCLUDED.name, last_active_at = NOW()
      RETURNING user_id
      """,
      (name, email),
    )
    row = cur.fetchone()

    cur.execute(
      """
      INSERT INTO privacy_settings (user_id)
      VALUES (%s)
      ON CONFLICT (user_id) DO NOTHING
      """,
      (row["user_id"],),
    )

  return str(row["user_id"])


def _replace_interests(conn, user_id: str, interests: list[str]) -> None:
  with conn.cursor() as cur:
    cur.execute("DELETE FROM user_interests WHERE user_id = %s", (user_id,))
    for interest in interests:
      cur.execute(
        "INSERT INTO user_interests (user_id, interest) VALUES (%s, %s)",
        (user_id, interest.lower()),
      )


def _reset_user_data(conn, user_id: str) -> None:
  with conn.cursor() as cur:
    cur.execute(
      """
      DELETE FROM chat_messages
      WHERE connection_id IN (
        SELECT connection_id
        FROM friend_connections
        WHERE user_a = %s OR user_b = %s
      )
      """,
      (user_id, user_id),
    )
    cur.execute("DELETE FROM friend_connections WHERE user_a = %s OR user_b = %s", (user_id, user_id))
    cur.execute("DELETE FROM social_likes WHERE from_user_id = %s OR to_user_id = %s", (user_id, user_id))
    cur.execute("DELETE FROM recommendations WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM user_matches WHERE user_id_1 = %s OR user_id_2 = %s", (user_id, user_id))
    cur.execute("DELETE FROM routine_profiles WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM daily_routes WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM route_segments WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM stay_points WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM location_logs WHERE user_id = %s", (user_id,))


def _insert_logs(conn, logs: list[dict[str, Any]]) -> None:
  with conn.cursor() as cur:
    for item in logs:
      cell_id = convert_gps_to_cell(
        item["latitude"],
        item["longitude"],
        grid_size_meters=settings.grid_size_meters,
      )
      cur.execute(
        """
        INSERT INTO location_logs (
          user_id, "timestamp", latitude, longitude,
          accuracy_meters, speed_mps, activity_type, cell_id
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
          item["user_id"],
          item["timestamp"],
          item["latitude"],
          item["longitude"],
          item["accuracy_meters"],
          item["speed_mps"],
          item["activity_type"],
          cell_id,
        ),
      )


def _fetch_logs(conn, user_id: str) -> list[dict[str, Any]]:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT log_id, user_id, "timestamp", latitude, longitude,
             accuracy_meters, speed_mps, activity_type, cell_id
      FROM location_logs
      WHERE user_id = %s
      ORDER BY "timestamp" ASC
      """,
      (user_id,),
    )
    return cur.fetchall()


def _persist_processing_outputs(conn, user_id: str, logs: list[dict[str, Any]]) -> None:
  stays = detect_stay_points(logs, grid_size_meters=settings.grid_size_meters)
  daily_groups: dict[date, list[dict[str, Any]]] = defaultdict(list)
  for log in logs:
    daily_groups[log["timestamp"].date()].append(log)

  with conn.cursor() as cur:
    for stay in stays:
      cur.execute(
        """
        INSERT INTO stay_points (
          user_id, start_time, end_time, duration_minutes,
          cell_id, centroid_lat, centroid_lng, place_category, confidence_score
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
          user_id,
          stay["start_time"],
          stay["end_time"],
          stay["duration_minutes"],
          stay["cell_id"],
          stay["centroid_lat"],
          stay["centroid_lng"],
          stay["place_category"],
          stay["confidence_score"],
        ),
      )

    for route_date, day_logs in sorted(daily_groups.items()):
      route = build_daily_route_from_logs(day_logs, route_date)
      if route:
        cur.execute(
          """
          INSERT INTO daily_routes (
            user_id, "date", compressed_route, main_loop,
            total_distance_meters, active_minutes, routine_score
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s)
          """,
          (
            user_id,
            route.route_date,
            Json(route.compressed_route),
            Json(route.main_loop),
            route.total_distance_meters,
            route.active_minutes,
            route.routine_score,
          ),
        )

      for segment in build_route_segments_from_logs(day_logs):
        cur.execute(
          """
          INSERT INTO route_segments (
            user_id, "date", start_time, end_time,
            start_cell_id, end_cell_id, cell_sequence,
            transport_mode, distance_meters, duration_minutes
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
          """,
          (
            user_id,
            route_date,
            segment["start_time"],
            segment["end_time"],
            segment["start_cell_id"],
            segment["end_cell_id"],
            Json(segment["cell_sequence"]),
            segment["transport_mode"],
            segment["distance_meters"],
            segment["duration_minutes"],
          ),
        )

    period_end = datetime.now(timezone.utc).date()
    period_start = period_end - timedelta(days=30)

    cur.execute(
      """
      SELECT daily_route_id, user_id, "date", compressed_route, main_loop,
             total_distance_meters, active_minutes, routine_score
      FROM daily_routes
      WHERE user_id = %s AND "date" BETWEEN %s AND %s
      ORDER BY "date" ASC
      """,
      (user_id, period_start, period_end),
    )
    daily_rows = cur.fetchall()

    cur.execute(
      """
      SELECT stay_id, user_id, start_time, end_time, duration_minutes,
             cell_id, centroid_lat, centroid_lng, place_category, confidence_score
      FROM stay_points
      WHERE user_id = %s
        AND start_time::date BETWEEN %s AND %s
      ORDER BY start_time ASC
      """,
      (user_id, period_start, period_end),
    )
    stay_rows = cur.fetchall()

  profile = build_routine_profile(
    user_id=user_id,
    period_start=period_start,
    period_end=period_end,
    daily_routes=daily_rows,
    stay_points=stay_rows,
    location_logs=logs,
  )

  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO routine_profiles (
        user_id, period_start, period_end, frequent_cells,
        frequent_place_categories, common_routes, time_pattern_vector,
        lifestyle_vector, routine_stability, updated_at
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
      ON CONFLICT (user_id, period_start, period_end)
      DO UPDATE SET
        frequent_cells = EXCLUDED.frequent_cells,
        frequent_place_categories = EXCLUDED.frequent_place_categories,
        common_routes = EXCLUDED.common_routes,
        time_pattern_vector = EXCLUDED.time_pattern_vector,
        lifestyle_vector = EXCLUDED.lifestyle_vector,
        routine_stability = EXCLUDED.routine_stability,
        updated_at = NOW()
      """,
      (
        user_id,
        profile["period_start"],
        profile["period_end"],
        Json(profile["frequent_cells"]),
        Json(profile["frequent_place_categories"]),
        Json(profile["common_routes"]),
        Json(profile["time_pattern_vector"]),
        Json(profile["lifestyle_vector"]),
        profile["routine_stability"],
      ),
    )


def _seed_places(conn) -> None:
  with conn.cursor() as cur:
    cur.execute("DELETE FROM places")
    for name, lat, lng, category, rating, price, partner in PLACE_SEEDS:
      cell_id = convert_gps_to_cell(lat, lng, grid_size_meters=settings.grid_size_meters)
      cur.execute(
        """
        INSERT INTO places (
          google_place_id, name, latitude, longitude, cell_id,
          category, rating, price_level, is_partner
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
          f"mock_{name.lower().replace(' ', '_')}",
          name,
          lat,
          lng,
          cell_id,
          category,
          rating,
          price,
          partner,
        ),
      )


def _recalculate_matches_and_recos(conn, user_ids: list[str]) -> None:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT DISTINCT ON (user_id)
        profile_id, user_id, period_start, period_end,
        frequent_cells, frequent_place_categories,
        common_routes, time_pattern_vector,
        lifestyle_vector, routine_stability, updated_at
      FROM routine_profiles
      ORDER BY user_id, period_end DESC, updated_at DESC
      """
    )
    profiles = {str(row["user_id"]): row for row in cur.fetchall()}

    cur.execute("SELECT user_id, interest FROM user_interests")
    interests_rows = cur.fetchall()

    cur.execute(
      """
      SELECT place_id, google_place_id, name, latitude, longitude,
             cell_id, category, rating, price_level, is_partner
      FROM places
      """
    )
    places = cur.fetchall()

  interests: dict[str, set[str]] = defaultdict(set)
  for row in interests_rows:
    interests[str(row["user_id"])].add(str(row["interest"]))

  with conn.cursor() as cur:
    cur.execute("DELETE FROM user_matches")
    cur.execute("DELETE FROM recommendations")

    for user_a in user_ids:
      profile_a = profiles.get(user_a)
      if not profile_a:
        continue

      for user_b in user_ids:
        if user_a == user_b:
          continue
        profile_b = profiles.get(user_b)
        if not profile_b:
          continue

        scores = calculate_match_score(profile_a, profile_b, interests.get(user_a), interests.get(user_b))
        explanation = generate_privacy_safe_explanation(scores, (profile_a, profile_b))
        cur.execute(
          """
          INSERT INTO user_matches (
            user_id_1, user_id_2, route_similarity, time_similarity,
            place_similarity, lifestyle_similarity, interest_similarity,
            final_score, explanation
          )
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
          """,
          (
            user_a,
            user_b,
            scores["route_similarity"],
            scores["time_similarity"],
            scores["place_similarity"],
            scores["lifestyle_similarity"],
            scores["interest_similarity"],
            scores["final_score"],
            explanation,
          ),
        )

      for reco in generate_recommendations(profile_a, places):
        cur.execute(
          """
          INSERT INTO recommendations (user_id, place_id, reason, score, shown_at)
        VALUES (%s, %s, %s, %s, NOW())
          """,
          (user_a, reco["place_id"], reco["reason"], reco["score"]),
        )


def _seed_social_graph(conn, user_ids_by_email: dict[str, str]) -> None:
  mutual_pairs = [
    ("jia@example.com", "mei@example.com"),
    ("jia@example.com", "arjun@example.com"),
    ("sara@example.com", "priya@example.com"),
    ("ethan@example.com", "noah@example.com"),
    ("hana@example.com", "mei@example.com"),
  ]
  one_way_pairs = [
    ("jia@example.com", "hana@example.com"),
    ("priya@example.com", "jia@example.com"),
    ("noah@example.com", "sara@example.com"),
  ]

  with conn.cursor() as cur:
    cur.execute("DELETE FROM chat_messages")
    cur.execute("DELETE FROM friend_connections")
    cur.execute("DELETE FROM social_likes")

    for left_email, right_email in mutual_pairs:
      left = user_ids_by_email.get(left_email)
      right = user_ids_by_email.get(right_email)
      if not left or not right:
        continue

      user_a, user_b = (left, right) if left < right else (right, left)
      cur.execute(
        """
        INSERT INTO friend_connections (user_a, user_b)
        VALUES (%s, %s)
        ON CONFLICT (user_a, user_b) DO NOTHING
        RETURNING connection_id
        """,
        (user_a, user_b),
      )
      row = cur.fetchone()
      if not row:
        cur.execute(
          """
          SELECT connection_id
          FROM friend_connections
          WHERE user_a = %s AND user_b = %s
          """,
          (user_a, user_b),
        )
        row = cur.fetchone()

      if not row:
        continue

      cur.execute(
        """
        INSERT INTO social_likes (from_user_id, to_user_id, status, created_at, updated_at)
        VALUES (%s, %s, 'liked', NOW(), NOW()),
               (%s, %s, 'liked', NOW(), NOW())
        ON CONFLICT (from_user_id, to_user_id)
        DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
        """,
        (left, right, right, left),
      )

      cur.execute(
        """
        INSERT INTO chat_messages (
          connection_id, sender_user_id, body, safety_flagged, safety_reason, safety_alternatives
        )
        VALUES
          (%s, %s, %s, FALSE, NULL, '[]'::jsonb),
          (%s, %s, %s, FALSE, NULL, '[]'::jsonb)
        """,
        (
          row["connection_id"],
          left,
          "Hey, I saw we both like public cafe meetups near transit. Want to plan for this weekend?",
          row["connection_id"],
          right,
          "Sounds good. Daytime works best for me, maybe around brunch hours.",
        ),
      )

    for from_email, to_email in one_way_pairs:
      from_user = user_ids_by_email.get(from_email)
      to_user = user_ids_by_email.get(to_email)
      if not from_user or not to_user:
        continue
      cur.execute(
        """
        INSERT INTO social_likes (from_user_id, to_user_id, status, created_at, updated_at)
        VALUES (%s, %s, 'liked', NOW(), NOW())
        ON CONFLICT (from_user_id, to_user_id)
        DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
        """,
        (from_user, to_user),
      )


def seed_database(days: int = 35) -> None:
  random.seed(42)
  run_migrations()

  with connect() as conn:
    user_ids: list[str] = []
    user_ids_by_email: dict[str, str] = {}

    for blueprint in USER_BLUEPRINTS:
      user_id = _ensure_user(conn, blueprint["name"], blueprint["email"])
      user_ids.append(user_id)
      user_ids_by_email[blueprint["email"]] = user_id
      _replace_interests(conn, user_id, blueprint["interests"])
      _reset_user_data(conn, user_id)

      logs = _generate_logs_for_user(
        user_id=user_id,
        weekday_stops=blueprint["weekday_stops"],
        weekend_stops=blueprint["weekend_stops"],
        days=days,
      )
      _insert_logs(conn, logs)
      processed_logs = _fetch_logs(conn, user_id)
      _persist_processing_outputs(conn, user_id, processed_logs)

    _seed_places(conn)
    _recalculate_matches_and_recos(conn, user_ids)
    _seed_social_graph(conn, user_ids_by_email)
    conn.commit()

  print(f"Seed complete. Users seeded: {len(USER_BLUEPRINTS)}")


def main() -> None:
  parser = argparse.ArgumentParser(description="Seed LifeLoop MVP database")
  parser.add_argument("--days", type=int, default=35, help="How many recent days of fake logs to generate")
  args = parser.parse_args()
  seed_database(days=args.days)


if __name__ == "__main__":
  main()
