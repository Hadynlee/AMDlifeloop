from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.types.json import Json

from ..db import get_db
from ..schemas import DailyRouteOut, RoutineProfileOut, StayPointOut
from ..services.routine import (
  build_daily_route_from_logs,
  build_route_segments_from_logs,
  build_routine_profile,
  detect_stay_points,
)

router = APIRouter(tags=["processing"])


def _fetch_logs(
  conn: psycopg.Connection,
  user_id: str,
  start_time: datetime | None = None,
  end_time: datetime | None = None,
) -> list[dict]:
  clauses = ["user_id = %s"]
  params: list[object] = [user_id]

  if start_time is not None:
    clauses.append('"timestamp" >= %s')
    params.append(start_time)
  if end_time is not None:
    clauses.append('"timestamp" <= %s')
    params.append(end_time)

  sql = f"""
    SELECT log_id, user_id, "timestamp", latitude, longitude, accuracy_meters, speed_mps, activity_type, cell_id
    FROM location_logs
    WHERE {' AND '.join(clauses)}
    ORDER BY "timestamp" ASC
  """

  with conn.cursor() as cur:
    cur.execute(sql, tuple(params))
    return cur.fetchall()


@router.post("/process/stay-points/{user_id}", response_model=list[StayPointOut])
def process_stay_points(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  logs = _fetch_logs(conn, str(user_id))
  if not logs:
    return []

  stays = detect_stay_points(logs)

  with conn.cursor() as cur:
    cur.execute("DELETE FROM stay_points WHERE user_id = %s", (str(user_id),))

    for stay in stays:
      cur.execute(
        """
        INSERT INTO stay_points (
          user_id, start_time, end_time, duration_minutes, cell_id,
          centroid_lat, centroid_lng, place_category, confidence_score
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
          str(user_id),
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

    cur.execute(
      """
      SELECT stay_id, user_id, start_time, end_time, duration_minutes, cell_id,
             centroid_lat, centroid_lng, place_category, confidence_score
      FROM stay_points
      WHERE user_id = %s
      ORDER BY start_time DESC
      """,
      (str(user_id),),
    )
    rows = cur.fetchall()

  return rows


@router.post("/process/daily-routes/{user_id}", response_model=list[DailyRouteOut])
def process_daily_routes(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  logs = _fetch_logs(conn, str(user_id))
  if not logs:
    return []

  grouped: dict[date, list[dict]] = defaultdict(list)
  for log in logs:
    ts = log["timestamp"]
    grouped[ts.date()].append(log)

  daily_results = []
  segment_results = []
  for route_date, day_logs in sorted(grouped.items()):
    route = build_daily_route_from_logs(day_logs, route_date)
    if route:
      daily_results.append(route)
    segments = build_route_segments_from_logs(day_logs)
    for segment in segments:
      segment_results.append((route_date, segment))

  with conn.cursor() as cur:
    cur.execute("DELETE FROM route_segments WHERE user_id = %s", (str(user_id),))
    cur.execute("DELETE FROM daily_routes WHERE user_id = %s", (str(user_id),))

    for route in daily_results:
      cur.execute(
        """
        INSERT INTO daily_routes (
          user_id, "date", compressed_route, main_loop,
          total_distance_meters, active_minutes, routine_score
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
          str(user_id),
          route.route_date,
          Json(route.compressed_route),
          Json(route.main_loop),
          route.total_distance_meters,
          route.active_minutes,
          route.routine_score,
        ),
      )

    for route_date, segment in segment_results:
      cur.execute(
        """
        INSERT INTO route_segments (
          user_id, "date", start_time, end_time, start_cell_id, end_cell_id,
          cell_sequence, transport_mode, distance_meters, duration_minutes
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
          str(user_id),
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

    cur.execute(
      """
      SELECT daily_route_id, user_id, "date", compressed_route, main_loop,
             total_distance_meters, active_minutes, routine_score
      FROM daily_routes
      WHERE user_id = %s
      ORDER BY "date" DESC
      """,
      (str(user_id),),
    )
    rows = cur.fetchall()

  return rows


@router.post("/process/routine-profile/{user_id}", response_model=RoutineProfileOut)
def process_routine_profile(
  user_id: UUID,
  period_start: date | None = Query(default=None),
  period_end: date | None = Query(default=None),
  conn: psycopg.Connection = Depends(get_db),
) -> dict:
  period_end_value = period_end or datetime.now(timezone.utc).date()
  period_start_value = period_start or (period_end_value - timedelta(days=30))

  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT daily_route_id, user_id, "date", compressed_route, main_loop,
             total_distance_meters, active_minutes, routine_score
      FROM daily_routes
      WHERE user_id = %s AND "date" BETWEEN %s AND %s
      ORDER BY "date" ASC
      """,
      (str(user_id), period_start_value, period_end_value),
    )
    daily_routes = cur.fetchall()

    cur.execute(
      """
      SELECT stay_id, user_id, start_time, end_time, duration_minutes, cell_id,
             centroid_lat, centroid_lng, place_category, confidence_score
      FROM stay_points
      WHERE user_id = %s
        AND start_time::date BETWEEN %s AND %s
      ORDER BY start_time ASC
      """,
      (str(user_id), period_start_value, period_end_value),
    )
    stay_points = cur.fetchall()

  if not daily_routes:
    raise HTTPException(status_code=400, detail="Run /process/daily-routes first")

  logs = _fetch_logs(
    conn,
    str(user_id),
    start_time=datetime.combine(period_start_value, datetime.min.time(), tzinfo=timezone.utc),
    end_time=datetime.combine(period_end_value, datetime.max.time(), tzinfo=timezone.utc),
  )

  profile = build_routine_profile(
    user_id=str(user_id),
    period_start=period_start_value,
    period_end=period_end_value,
    daily_routes=daily_routes,
    stay_points=stay_points,
    location_logs=logs,
  )

  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO routine_profiles (
        user_id, period_start, period_end, frequent_cells, frequent_place_categories,
        common_routes, time_pattern_vector, lifestyle_vector, routine_stability, updated_at
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
      RETURNING profile_id, user_id, period_start, period_end,
                frequent_cells, frequent_place_categories, common_routes,
                time_pattern_vector, lifestyle_vector, routine_stability, updated_at
      """,
      (
        str(user_id),
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
    row = cur.fetchone()

  if not row:
    raise HTTPException(status_code=500, detail="Failed to save routine profile")
  return row
