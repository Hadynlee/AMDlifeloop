from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..config import settings
from ..db import get_db
from ..schemas import LocationBatchIn, LocationLogIn, LocationLogOut, MessageResponse
from ..services.geo import cell_id_to_center, convert_gps_to_cell

router = APIRouter(tags=["location"])


def _is_tracking_enabled(conn: psycopg.Connection, user_id: str) -> bool:
  with conn.cursor() as cur:
    cur.execute("SELECT tracking_enabled FROM privacy_settings WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
      return True
    return bool(row["tracking_enabled"])


def _upsert_area_cell(conn: psycopg.Connection, cell_id: str) -> None:
  center = cell_id_to_center(cell_id, grid_size_meters=settings.grid_size_meters)
  if not center:
    return
  center_lat, center_lng = center
  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO area_cells (cell_id, center_lat, center_lng, grid_size_meters)
      VALUES (%s, %s, %s, %s)
      ON CONFLICT (cell_id) DO NOTHING
      """,
      (cell_id, center_lat, center_lng, settings.grid_size_meters),
    )


def _insert_location_log(conn: psycopg.Connection, payload: LocationLogIn) -> dict:
  cell_id = convert_gps_to_cell(
    payload.latitude,
    payload.longitude,
    grid_size_meters=settings.grid_size_meters,
  )
  _upsert_area_cell(conn, cell_id)

  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO location_logs (
        user_id, "timestamp", latitude, longitude, accuracy_meters, speed_mps, activity_type, cell_id
      )
      VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
      RETURNING log_id, user_id, "timestamp", latitude, longitude,
                accuracy_meters, speed_mps, activity_type, cell_id, created_at
      """,
      (
        str(payload.user_id),
        payload.timestamp,
        payload.latitude,
        payload.longitude,
        payload.accuracy_meters,
        payload.speed_mps,
        payload.activity_type,
        cell_id,
      ),
    )
    row = cur.fetchone()

  if not row:
    raise HTTPException(status_code=500, detail="Failed to insert location log")
  return row


@router.post("/location/log", response_model=LocationLogOut, status_code=status.HTTP_201_CREATED)
def create_location_log(payload: LocationLogIn, conn: psycopg.Connection = Depends(get_db)) -> dict:
  if not _is_tracking_enabled(conn, str(payload.user_id)):
    raise HTTPException(status_code=403, detail="Tracking is disabled for this user")

  return _insert_location_log(conn, payload)


@router.post("/location/batch", response_model=list[LocationLogOut], status_code=status.HTTP_201_CREATED)
def create_location_logs_batch(payload: LocationBatchIn, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  if not payload.logs:
    return []

  tracking_cache: dict[str, bool] = {}
  inserted: list[dict] = []
  for log in payload.logs:
    user_key = str(log.user_id)
    if user_key not in tracking_cache:
      tracking_cache[user_key] = _is_tracking_enabled(conn, user_key)
    if not tracking_cache[user_key]:
      continue
    inserted.append(_insert_location_log(conn, log))

  return inserted


@router.get("/location/history/{user_id}", response_model=list[LocationLogOut])
def get_location_history(
  user_id: UUID,
  limit: int = Query(default=1000, ge=1, le=5000),
  conn: psycopg.Connection = Depends(get_db),
) -> list[dict]:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT log_id, user_id, "timestamp", latitude, longitude,
             accuracy_meters, speed_mps, activity_type, cell_id, created_at
      FROM location_logs
      WHERE user_id = %s
      ORDER BY "timestamp" DESC
      LIMIT %s
      """,
      (str(user_id), limit),
    )
    rows = cur.fetchall()

  return rows


@router.delete("/location/history/{user_id}", response_model=MessageResponse)
def delete_location_history(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> dict:
  user_key = str(user_id)

  with conn.cursor() as cur:
    cur.execute("DELETE FROM location_logs WHERE user_id = %s", (user_key,))
    logs_deleted = cur.rowcount
    cur.execute("DELETE FROM stay_points WHERE user_id = %s", (user_key,))
    stays_deleted = cur.rowcount
    cur.execute("DELETE FROM route_segments WHERE user_id = %s", (user_key,))
    segments_deleted = cur.rowcount
    cur.execute("DELETE FROM daily_routes WHERE user_id = %s", (user_key,))
    daily_deleted = cur.rowcount
    cur.execute("DELETE FROM routine_profiles WHERE user_id = %s", (user_key,))
    profile_deleted = cur.rowcount
    cur.execute("DELETE FROM recommendations WHERE user_id = %s", (user_key,))
    reco_deleted = cur.rowcount
    cur.execute("DELETE FROM user_matches WHERE user_id_1 = %s OR user_id_2 = %s", (user_key, user_key))
    matches_deleted = cur.rowcount

  message = (
    f"Deleted {logs_deleted} location logs, {stays_deleted} stay points, {segments_deleted} route segments, "
    f"{daily_deleted} daily routes, {profile_deleted} profiles, {reco_deleted} recommendations, "
    f"and {matches_deleted} matches."
  )
  return {"message": message}
