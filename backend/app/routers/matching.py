from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..schemas import MatchOut
from ..services.matching import calculate_match_score, generate_privacy_safe_explanation

router = APIRouter(tags=["matching"])


def _latest_profiles(conn: psycopg.Connection) -> list[dict]:
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
    return cur.fetchall()


def _load_interests(conn: psycopg.Connection) -> dict[str, set[str]]:
  with conn.cursor() as cur:
    cur.execute("SELECT user_id, interest FROM user_interests")
    rows = cur.fetchall()

  mapping: dict[str, set[str]] = {}
  for row in rows:
    user_key = str(row["user_id"])
    mapping.setdefault(user_key, set()).add(str(row["interest"]).lower())
  return mapping


def _is_matching_enabled(conn: psycopg.Connection, user_id: str) -> bool:
  with conn.cursor() as cur:
    cur.execute("SELECT matching_enabled FROM privacy_settings WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
  if not row:
    return True
  return bool(row["matching_enabled"])


@router.post("/match/recalculate/{user_id}", response_model=list[MatchOut])
def recalculate_matches(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  user_key = str(user_id)
  if not _is_matching_enabled(conn, user_key):
    raise HTTPException(status_code=403, detail="Matching is disabled for this user")

  profiles = _latest_profiles(conn)
  profile_map = {str(profile["user_id"]): profile for profile in profiles}
  target_profile = profile_map.get(user_key)
  if not target_profile:
    raise HTTPException(status_code=400, detail="Routine profile missing. Run /process/routine-profile first")

  interests_map = _load_interests(conn)

  generated = []
  for candidate_id, candidate_profile in profile_map.items():
    if candidate_id == user_key:
      continue
    if not _is_matching_enabled(conn, candidate_id):
      continue

    scores = calculate_match_score(
      target_profile,
      candidate_profile,
      interests_map.get(user_key, set()),
      interests_map.get(candidate_id, set()),
    )
    explanation = generate_privacy_safe_explanation(scores, (target_profile, candidate_profile))
    generated.append((candidate_id, scores, explanation))

  with conn.cursor() as cur:
    cur.execute("DELETE FROM user_matches WHERE user_id_1 = %s", (user_key,))

    for candidate_id, scores, explanation in generated:
      cur.execute(
        """
        INSERT INTO user_matches (
          user_id_1, user_id_2,
          route_similarity, time_similarity, place_similarity,
          lifestyle_similarity, interest_similarity,
          final_score, explanation
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
          user_key,
          candidate_id,
          scores["route_similarity"],
          scores["time_similarity"],
          scores["place_similarity"],
          scores["lifestyle_similarity"],
          scores["interest_similarity"],
          scores["final_score"],
          explanation,
        ),
      )

    cur.execute(
      """
      SELECT m.match_id, m.user_id_1, m.user_id_2,
             m.route_similarity, m.time_similarity, m.place_similarity,
             m.lifestyle_similarity, m.interest_similarity,
             m.final_score, m.explanation, m.created_at,
             u.name AS other_user_name
      FROM user_matches m
      JOIN users u ON u.user_id = m.user_id_2
      WHERE m.user_id_1 = %s
      ORDER BY m.final_score DESC, m.created_at DESC
      """,
      (user_key,),
    )
    rows = cur.fetchall()

  return rows


@router.get("/matches/{user_id}", response_model=list[MatchOut])
def get_matches(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT m.match_id, m.user_id_1, m.user_id_2,
             m.route_similarity, m.time_similarity, m.place_similarity,
             m.lifestyle_similarity, m.interest_similarity,
             m.final_score, m.explanation, m.created_at,
             u.name AS other_user_name
      FROM user_matches m
      JOIN users u ON u.user_id = m.user_id_2
      WHERE m.user_id_1 = %s
      ORDER BY m.final_score DESC, m.created_at DESC
      """,
      (str(user_id),),
    )
    rows = cur.fetchall()

  return rows
