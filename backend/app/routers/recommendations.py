from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..schemas import RecommendationOut
from ..services.recommendations import generate_recommendations

router = APIRouter(tags=["recommendations"])


def _is_reco_enabled(conn: psycopg.Connection, user_id: str) -> bool:
  with conn.cursor() as cur:
    cur.execute("SELECT allow_recommendations FROM privacy_settings WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
  if not row:
    return True
  return bool(row["allow_recommendations"])


def _latest_profile(conn: psycopg.Connection, user_id: str) -> dict | None:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT profile_id, user_id, period_start, period_end,
             frequent_cells, frequent_place_categories,
             common_routes, time_pattern_vector,
             lifestyle_vector, routine_stability, updated_at
      FROM routine_profiles
      WHERE user_id = %s
      ORDER BY period_end DESC, updated_at DESC
      LIMIT 1
      """,
      (user_id,),
    )
    return cur.fetchone()


@router.post("/recommendations/recalculate/{user_id}", response_model=list[RecommendationOut])
def recalculate_recommendations(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  user_key = str(user_id)
  if not _is_reco_enabled(conn, user_key):
    raise HTTPException(status_code=403, detail="Recommendations are disabled for this user")

  profile = _latest_profile(conn, user_key)
  if not profile:
    raise HTTPException(status_code=400, detail="Routine profile missing. Run /process/routine-profile first")

  with conn.cursor() as cur:
    cur.execute("SELECT place_id FROM recommendations WHERE user_id = %s AND visited = TRUE", (user_key,))
    visited = {str(row["place_id"]) for row in cur.fetchall()}

    cur.execute(
      """
      SELECT place_id, google_place_id, name, latitude, longitude, cell_id,
             category, rating, price_level, is_partner
      FROM places
      """
    )
    places = cur.fetchall()

  generated = generate_recommendations(profile=profile, places=places, visited_place_ids=visited)

  with conn.cursor() as cur:
    cur.execute("DELETE FROM recommendations WHERE user_id = %s", (user_key,))

    for recommendation in generated:
      cur.execute(
        """
        INSERT INTO recommendations (user_id, place_id, reason, score, shown_at)
        VALUES (%s, %s, %s, %s, NOW())
        """,
        (
          user_key,
          recommendation["place_id"],
          recommendation["reason"],
          recommendation["score"],
        ),
      )

    cur.execute(
      """
      SELECT r.recommendation_id, r.user_id, r.place_id,
             r.reason, r.score, r.shown_at, r.clicked, r.visited,
             p.place_id AS p_place_id, p.google_place_id, p.name,
             p.latitude, p.longitude, p.cell_id, p.category,
             p.rating, p.price_level, p.is_partner
      FROM recommendations r
      JOIN places p ON p.place_id = r.place_id
      WHERE r.user_id = %s
      ORDER BY r.score DESC, r.created_at DESC
      """,
      (user_key,),
    )
    rows = cur.fetchall()

  return [_row_with_place(row) for row in rows]


@router.get("/recommendations/{user_id}", response_model=list[RecommendationOut])
def get_recommendations(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT r.recommendation_id, r.user_id, r.place_id,
             r.reason, r.score, r.shown_at, r.clicked, r.visited,
             p.place_id AS p_place_id, p.google_place_id, p.name,
             p.latitude, p.longitude, p.cell_id, p.category,
             p.rating, p.price_level, p.is_partner
      FROM recommendations r
      JOIN places p ON p.place_id = r.place_id
      WHERE r.user_id = %s
      ORDER BY r.score DESC, r.created_at DESC
      """,
      (str(user_id),),
    )
    rows = cur.fetchall()

  return [_row_with_place(row) for row in rows]


def _row_with_place(row: dict) -> dict:
  place = {
    "place_id": row["p_place_id"],
    "google_place_id": row["google_place_id"],
    "name": row["name"],
    "latitude": row["latitude"],
    "longitude": row["longitude"],
    "cell_id": row["cell_id"],
    "category": row["category"],
    "rating": row["rating"],
    "price_level": row["price_level"],
    "is_partner": row["is_partner"],
  }

  return {
    "recommendation_id": row["recommendation_id"],
    "user_id": row["user_id"],
    "place_id": row["place_id"],
    "reason": row["reason"],
    "score": row["score"],
    "shown_at": row["shown_at"],
    "clicked": row["clicked"],
    "visited": row["visited"],
    "place": place,
  }
