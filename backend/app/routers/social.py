from __future__ import annotations

import json
import logging
import hashlib
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Json

from ..db import get_db
from ..schemas import (
  ChatMessageIn,
  ChatMessageOut,
  ChatThreadOut,
  FollowupAnswerOut,
  FollowupQuestionIn,
  FriendOut,
  LikedUserOut,
  MatchCoachOut,
  MatchLikeIn,
  MatchLikeOut,
  RoutineMirrorOut,
)
from ..services.social import (
  answer_match_followup,
  answer_routine_followup,
  evaluate_safety_message,
  first_meet_activity_types,
  match_fit_explanation,
  new_people_discovery_note,
  ordered_pair,
  place_scout_suggestions,
  routine_mirror_summary,
  safe_icebreakers,
  weekly_social_windows,
)
from ..services.social_agent import generate_social_reply, social_agent_enabled

router = APIRouter(tags=["social"])
logger = logging.getLogger(__name__)


def _safe_json(data: object) -> str:
  return json.dumps(data, ensure_ascii=True, default=str, sort_keys=True)


def _routine_answer_with_agent(question: str, mirror_payload: dict[str, object]) -> str:
  if not social_agent_enabled():
    return answer_routine_followup(question, mirror_payload)

  system_prompt = (
    "You are Routine Mirror, a privacy-safe routine coach. "
    "Answer with direct, practical guidance based only on the provided weekly summary context. "
    "Do not invent metrics, places, or dates. Keep replies to 2-5 short sentences."
  )
  user_prompt = (
    f"User question:\n{question.strip()}\n\n"
    f"Routine context JSON:\n{_safe_json(mirror_payload)}\n\n"
    "Focus on drift, energy windows, and habit consistency when relevant."
  )
  try:
    return generate_social_reply(system_prompt, user_prompt, temperature=0.4, max_output_tokens=260)
  except Exception as exc:
    logger.warning("routine-agent-fallback: %s", exc)
    return answer_routine_followup(question, mirror_payload)


def _match_answer_with_agent(question: str, context: dict[str, object]) -> str:
  if not social_agent_enabled():
    return answer_match_followup(question, context)

  system_prompt = (
    "You are Match Coach for a privacy-first social app. "
    "Explain compatibility clearly, keep advice safe for first meetings, and avoid over-claiming. "
    "Use only supplied context. Keep replies to 2-5 short sentences."
  )
  user_prompt = (
    f"User question:\n{question.strip()}\n\n"
    f"Match context JSON:\n{_safe_json(context)}\n\n"
    "Prioritize safe public meetups and practical next steps."
  )
  try:
    return generate_social_reply(system_prompt, user_prompt, temperature=0.45, max_output_tokens=280)
  except Exception as exc:
    logger.warning("match-agent-fallback: %s", exc)
    return answer_match_followup(question, context)


def _friend_reply_with_agent(
  *,
  user_id: str,
  friend_id: str,
  user_name: str,
  friend_name: str,
  user_message: str,
  recent_messages: list[dict],
  weekly_windows: list[dict],
  place_scout: list[dict],
  incoming_safety: dict[str, object],
) -> str | None:
  if not social_agent_enabled():
    return None

  transcript_lines: list[str] = []
  for message in recent_messages[-8:]:
    sender = str(message.get("sender_user_id") or "")
    speaker = friend_name if sender == friend_id else user_name if sender == user_id else "Member"
    body = str(message.get("body") or "").strip()
    if body:
      transcript_lines.append(f"{speaker}: {body}")

  windows = [str(item.get("label")) for item in weekly_windows if item.get("label")]
  place_names = [str(item.get("name")) for item in place_scout if item.get("name")]

  system_prompt = (
    "You are chatting as a matched friend inside LifeLoop. "
    "Reply naturally in first person as the friend, with concise 1-3 sentences. "
    "Never request secrecy, money, explicit content, or private-home first meetups. "
    "If the incoming message is risky, redirect to a safer public daytime alternative."
  )
  user_prompt = (
    f"You are {friend_name}. The other person is {user_name}.\n"
    f"Most recent user message:\n{user_message.strip()}\n\n"
    f"Recent transcript:\n{chr(10).join(transcript_lines) if transcript_lines else '(no prior messages)'}\n\n"
    f"Suggested social windows: {', '.join(windows[:3]) if windows else 'none'}\n"
    f"Suggested public places: {', '.join(place_names[:3]) if place_names else 'none'}\n"
    f"Risk flags on incoming message: {_safe_json(incoming_safety)}"
  )
  try:
    return generate_social_reply(system_prompt, user_prompt, temperature=0.65, max_output_tokens=140)
  except Exception as exc:
    logger.warning("friend-agent-skip: %s", exc)
    return None


def _latest_profiles(conn: psycopg.Connection) -> dict[str, dict]:
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
    rows = cur.fetchall()
  return {str(row["user_id"]): row for row in rows}


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


def _load_interests(conn: psycopg.Connection) -> dict[str, set[str]]:
  with conn.cursor() as cur:
    cur.execute("SELECT user_id, interest FROM user_interests")
    rows = cur.fetchall()

  mapping: dict[str, set[str]] = {}
  for row in rows:
    mapping.setdefault(str(row["user_id"]), set()).add(str(row["interest"]).lower())
  return mapping


def _load_places(conn: psycopg.Connection) -> list[dict]:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT place_id, google_place_id, name, latitude, longitude, cell_id,
             category, rating, price_level, is_partner
      FROM places
      ORDER BY rating DESC NULLS LAST, created_at DESC
      """
    )
    return cur.fetchall()


def _auto_reciprocal_like(conn: psycopg.Connection, user_a: str, user_b: str) -> None:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT final_score
      FROM user_matches
      WHERE user_id_1 = %s AND user_id_2 = %s
      """,
      (user_b, user_a),
    )
    reverse_match = cur.fetchone()

  if not reverse_match:
    return

  score = float(reverse_match.get("final_score") or 0.0)
  if score < 0.58:
    return

  digest = hashlib.sha1(f"{user_a}:{user_b}".encode("utf-8")).hexdigest()
  chance = int(digest[:2], 16) / 255.0
  if chance > 0.64:
    return

  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO social_likes (from_user_id, to_user_id, status, created_at, updated_at)
      VALUES (%s, %s, 'liked', NOW(), NOW())
      ON CONFLICT (from_user_id, to_user_id)
      DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
      """,
      (user_b, user_a),
    )


def _connection_for_pair(conn: psycopg.Connection, user_a: str, user_b: str) -> dict | None:
  left, right = ordered_pair(user_a, user_b)
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT connection_id, user_a, user_b, created_at
      FROM friend_connections
      WHERE user_a = %s AND user_b = %s
      """,
      (left, right),
    )
    return cur.fetchone()


def _ensure_friend_connection(conn: psycopg.Connection, user_a: str, user_b: str) -> dict:
  left, right = ordered_pair(user_a, user_b)
  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO friend_connections (user_a, user_b)
      VALUES (%s, %s)
      ON CONFLICT (user_a, user_b) DO NOTHING
      """,
      (left, right),
    )

  connection = _connection_for_pair(conn, user_a, user_b)
  if not connection:
    raise HTTPException(status_code=500, detail="Failed to create friend connection")
  return connection


def _is_mutual_like(conn: psycopg.Connection, user_a: str, user_b: str) -> bool:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT
        EXISTS(SELECT 1 FROM social_likes WHERE from_user_id = %s AND to_user_id = %s AND status = 'liked') AS a_likes_b,
        EXISTS(SELECT 1 FROM social_likes WHERE from_user_id = %s AND to_user_id = %s AND status = 'liked') AS b_likes_a
      """,
      (user_a, user_b, user_b, user_a),
    )
    row = cur.fetchone()

  return bool(row and row["a_likes_b"] and row["b_likes_a"])


def _load_match_rows(conn: psycopg.Connection, user_id: str) -> list[dict]:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT m.match_id, m.user_id_1, m.user_id_2,
             m.route_similarity, m.time_similarity, m.place_similarity,
             m.lifestyle_similarity, m.interest_similarity,
             m.final_score, m.explanation, m.created_at,
             u.name AS other_user_name,
             COALESCE(sl.status, 'none') AS like_state,
             EXISTS(
               SELECT 1 FROM social_likes s2
               WHERE s2.from_user_id = m.user_id_2
                 AND s2.to_user_id = m.user_id_1
                 AND s2.status = 'liked'
             ) AS liked_back
      FROM user_matches m
      JOIN users u ON u.user_id = m.user_id_2
      LEFT JOIN social_likes sl
        ON sl.from_user_id = m.user_id_1
       AND sl.to_user_id = m.user_id_2
      WHERE m.user_id_1 = %s
      ORDER BY m.final_score DESC, m.created_at DESC
      """,
      (user_id,),
    )
    return cur.fetchall()


def _load_user_name(conn: psycopg.Connection, user_id: str) -> str:
  with conn.cursor() as cur:
    cur.execute("SELECT name FROM users WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
  if not row:
    raise HTTPException(status_code=404, detail="User not found")
  return str(row["name"])


def _weekly_windows_for_pair(profiles: dict[str, dict], user_id: str, other_id: str) -> list[dict]:
  profile_user = profiles.get(user_id)
  profile_other = profiles.get(other_id)
  if not profile_user or not profile_other:
    return []
  return weekly_social_windows(profile_user, profile_other)


def _place_scout_for_pair(profiles: dict[str, dict], places: list[dict], user_id: str, other_id: str) -> list[dict]:
  profile_user = profiles.get(user_id)
  profile_other = profiles.get(other_id)
  if not profile_user or not profile_other:
    return []
  return place_scout_suggestions(profile_user, profile_other, places)


@router.get("/social/match-coach/{user_id}", response_model=list[MatchCoachOut])
def get_match_coach(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  user_key = str(user_id)
  matches = _load_match_rows(conn, user_key)
  profiles = _latest_profiles(conn)
  interests = _load_interests(conn)

  profile_user = profiles.get(user_key)
  if not profile_user:
    raise HTTPException(status_code=400, detail="Routine profile missing. Run /process/routine-profile first")

  output: list[dict] = []
  for row in matches:
    other_key = str(row["user_id_2"])
    profile_other = profiles.get(other_key)
    if not profile_other:
      continue

    scores = {
      "route_similarity": row["route_similarity"],
      "time_similarity": row["time_similarity"],
      "place_similarity": row["place_similarity"],
      "lifestyle_similarity": row["lifestyle_similarity"],
      "interest_similarity": row["interest_similarity"],
      "final_score": row["final_score"],
    }

    fit_explanation = match_fit_explanation(
      scores,
      profile_user,
      profile_other,
      interests.get(user_key, set()),
      interests.get(other_key, set()),
    )
    discovery_note = new_people_discovery_note(profile_user, profile_other)
    icebreakers = safe_icebreakers(profile_user, profile_other)
    activities = first_meet_activity_types(profile_user, profile_other)

    output.append(
      {
        "match_id": row["match_id"],
        "user_id_1": row["user_id_1"],
        "user_id_2": row["user_id_2"],
        "other_user_name": row["other_user_name"],
        "route_similarity": row["route_similarity"],
        "time_similarity": row["time_similarity"],
        "place_similarity": row["place_similarity"],
        "lifestyle_similarity": row["lifestyle_similarity"],
        "interest_similarity": row["interest_similarity"],
        "final_score": row["final_score"],
        "fit_explanation": fit_explanation,
        "discovery_note": discovery_note,
        "like_state": row["like_state"],
        "is_mutual": bool(row["like_state"] == "liked" and row["liked_back"]),
        "safe_icebreakers": icebreakers,
        "first_meet_activities": activities,
        "created_at": row["created_at"],
      }
    )

  return output


@router.post("/social/likes", response_model=MatchLikeOut)
def like_match(payload: MatchLikeIn, conn: psycopg.Connection = Depends(get_db)) -> dict:
  from_user = str(payload.from_user_id)
  to_user = str(payload.to_user_id)
  action = "liked" if payload.action == "like" else "passed"

  if from_user == to_user:
    raise HTTPException(status_code=400, detail="Cannot like yourself")

  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO social_likes (from_user_id, to_user_id, status, created_at, updated_at)
      VALUES (%s, %s, %s, NOW(), NOW())
      ON CONFLICT (from_user_id, to_user_id)
      DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
      """,
      (from_user, to_user, action),
    )

  if action == "liked":
    _auto_reciprocal_like(conn, from_user, to_user)

  is_mutual = _is_mutual_like(conn, from_user, to_user)
  connection_id = None
  if is_mutual:
    connection = _ensure_friend_connection(conn, from_user, to_user)
    connection_id = connection["connection_id"]

  profiles = _latest_profiles(conn)
  profile_from = profiles.get(from_user)
  profile_to = profiles.get(to_user)

  if profile_from and profile_to:
    icebreakers = safe_icebreakers(profile_from, profile_to)
    activities = first_meet_activity_types(profile_from, profile_to)
  else:
    icebreakers = ["Ask about a recent weekly highlight."]
    activities = ["Public cafe meetup near transit."]

  return {
    "from_user_id": from_user,
    "to_user_id": to_user,
    "like_state": action,
    "is_mutual": is_mutual,
    "friend_connection_id": connection_id,
    "safe_icebreakers": icebreakers,
    "first_meet_activities": activities,
  }


@router.get("/social/liked/{user_id}", response_model=list[LikedUserOut])
def list_liked_people(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  user_key = str(user_id)
  profiles = _latest_profiles(conn)

  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT sl.to_user_id AS other_user_id,
             u.name AS other_user_name,
             sl.status AS like_state,
             EXISTS(
               SELECT 1 FROM social_likes back_like
               WHERE back_like.from_user_id = sl.to_user_id
                 AND back_like.to_user_id = sl.from_user_id
                 AND back_like.status = 'liked'
             ) AS is_mutual
      FROM social_likes sl
      JOIN users u ON u.user_id = sl.to_user_id
      WHERE sl.from_user_id = %s AND sl.status = 'liked'
      ORDER BY sl.updated_at DESC
      """,
      (user_key,),
    )
    rows = cur.fetchall()

  response: list[dict] = []
  for row in rows:
    other_key = str(row["other_user_id"])
    response.append(
      {
        "other_user_id": row["other_user_id"],
        "other_user_name": row["other_user_name"],
        "like_state": row["like_state"],
        "is_mutual": row["is_mutual"],
        "weekly_windows": _weekly_windows_for_pair(profiles, user_key, other_key),
      }
    )

  return response


@router.get("/social/friends/{user_id}", response_model=list[FriendOut])
def list_friends(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> list[dict]:
  user_key = str(user_id)
  profiles = _latest_profiles(conn)
  places = _load_places(conn)

  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT fc.connection_id, fc.user_a, fc.user_b, fc.created_at,
             CASE WHEN fc.user_a = %s THEN u2.user_id ELSE u1.user_id END AS friend_user_id,
             CASE WHEN fc.user_a = %s THEN u2.name ELSE u1.name END AS friend_name
      FROM friend_connections fc
      JOIN users u1 ON u1.user_id = fc.user_a
      JOIN users u2 ON u2.user_id = fc.user_b
      WHERE fc.user_a = %s OR fc.user_b = %s
      ORDER BY fc.created_at DESC
      """,
      (user_key, user_key, user_key, user_key),
    )
    rows = cur.fetchall()

  response: list[dict] = []
  for row in rows:
    friend_key = str(row["friend_user_id"])
    response.append(
      {
        "connection_id": row["connection_id"],
        "friend_user_id": row["friend_user_id"],
        "friend_name": row["friend_name"],
        "connected_at": row["created_at"],
        "weekly_windows": _weekly_windows_for_pair(profiles, user_key, friend_key),
        "place_scout": _place_scout_for_pair(profiles, places, user_key, friend_key),
      }
    )

  return response


def _chat_messages(conn: psycopg.Connection, connection_id: str) -> list[dict]:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT message_id, connection_id, sender_user_id, body,
             safety_flagged, safety_reason,
             COALESCE(safety_alternatives, '[]'::jsonb) AS safety_alternatives,
             created_at
      FROM chat_messages
      WHERE connection_id = %s
      ORDER BY created_at ASC
      """,
      (connection_id,),
    )
    rows = cur.fetchall()

  output: list[dict] = []
  for row in rows:
    alternatives = row.get("safety_alternatives")
    if not isinstance(alternatives, list):
      alternatives = []
    output.append(
      {
        "message_id": row["message_id"],
        "connection_id": row["connection_id"],
        "sender_user_id": row["sender_user_id"],
        "body": row["body"],
        "safety_flagged": row["safety_flagged"],
        "safety_reason": row["safety_reason"],
        "safety_alternatives": alternatives,
        "created_at": row["created_at"],
      }
    )
  return output


def _normalize_chat_row(row: dict) -> dict:
  alternatives = row.get("safety_alternatives")
  if not isinstance(alternatives, list):
    alternatives = []

  return {
    "message_id": row["message_id"],
    "connection_id": row["connection_id"],
    "sender_user_id": row["sender_user_id"],
    "body": row["body"],
    "safety_flagged": row["safety_flagged"],
    "safety_reason": row["safety_reason"],
    "safety_alternatives": alternatives,
    "created_at": row["created_at"],
  }


def _insert_chat_message(
  conn: psycopg.Connection,
  *,
  connection_id: str,
  sender_user_id: str,
  body: str,
  safety: dict[str, object],
) -> dict:
  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO chat_messages (
        connection_id, sender_user_id, body,
        safety_flagged, safety_reason, safety_alternatives
      )
      VALUES (%s, %s, %s, %s, %s, %s)
      RETURNING message_id, connection_id, sender_user_id, body,
                safety_flagged, safety_reason,
                COALESCE(safety_alternatives, '[]'::jsonb) AS safety_alternatives,
                created_at
      """,
      (
        connection_id,
        sender_user_id,
        body,
        bool(safety.get("flagged")),
        safety.get("reason"),
        Json(safety.get("alternatives") or []),
      ),
    )
    row = cur.fetchone()

  if not row:
    raise HTTPException(status_code=500, detail="Failed to save message")
  return _normalize_chat_row(row)


@router.get("/social/chats/{user_id}/{friend_user_id}", response_model=ChatThreadOut)
def get_chat_thread(user_id: UUID, friend_user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> dict:
  user_key = str(user_id)
  friend_key = str(friend_user_id)

  connection = _connection_for_pair(conn, user_key, friend_key)
  if not connection:
    raise HTTPException(status_code=404, detail="No mutual friend connection yet")

  profiles = _latest_profiles(conn)
  places = _load_places(conn)
  friend_name = _load_user_name(conn, friend_key)
  messages = _chat_messages(conn, str(connection["connection_id"]))

  return {
    "connection_id": connection["connection_id"],
    "friend_user_id": friend_key,
    "friend_name": friend_name,
    "weekly_windows": _weekly_windows_for_pair(profiles, user_key, friend_key),
    "place_scout": _place_scout_for_pair(profiles, places, user_key, friend_key),
    "messages": messages,
  }


@router.post("/social/chats/{user_id}/{friend_user_id}/messages", response_model=ChatMessageOut)
def send_chat_message(
  user_id: UUID,
  friend_user_id: UUID,
  payload: ChatMessageIn,
  conn: psycopg.Connection = Depends(get_db),
) -> dict:
  user_key = str(user_id)
  friend_key = str(friend_user_id)
  sender_key = str(payload.sender_user_id)

  if sender_key not in {user_key, friend_key}:
    raise HTTPException(status_code=403, detail="Sender must be one of the two connected users")

  connection = _connection_for_pair(conn, user_key, friend_key)
  if not connection:
    raise HTTPException(status_code=404, detail="No mutual friend connection yet")

  connection_id = str(connection["connection_id"])
  body = payload.body.strip()
  safety = evaluate_safety_message(body)

  saved = _insert_chat_message(
    conn,
    connection_id=connection_id,
    sender_user_id=sender_key,
    body=body,
    safety=safety,
  )

  if sender_key == user_key:
    try:
      profiles = _latest_profiles(conn)
      places = _load_places(conn)
      user_name = _load_user_name(conn, user_key)
      friend_name = _load_user_name(conn, friend_key)
      recent_messages = _chat_messages(conn, connection_id)
      weekly_windows = _weekly_windows_for_pair(profiles, user_key, friend_key)
      place_scout = _place_scout_for_pair(profiles, places, user_key, friend_key)

      friend_reply = _friend_reply_with_agent(
        user_id=user_key,
        friend_id=friend_key,
        user_name=user_name,
        friend_name=friend_name,
        user_message=body,
        recent_messages=recent_messages,
        weekly_windows=weekly_windows,
        place_scout=place_scout,
        incoming_safety=safety,
      )
      if friend_reply:
        reply_body = friend_reply.strip()
        if reply_body:
          reply_safety = evaluate_safety_message(reply_body)
          _insert_chat_message(
            conn,
            connection_id=connection_id,
            sender_user_id=friend_key,
            body=reply_body,
            safety=reply_safety,
          )
    except Exception as exc:
      logger.warning("friend-agent-reply-skipped: %s", exc)

  return saved


@router.get("/social/routine-mirror/{user_id}", response_model=RoutineMirrorOut)
def get_routine_mirror(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> dict:
  user_key = str(user_id)
  profile = _latest_profile(conn, user_key)

  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT daily_route_id, user_id, "date", compressed_route, main_loop,
             total_distance_meters, active_minutes, routine_score, created_at
      FROM daily_routes
      WHERE user_id = %s
      ORDER BY "date" ASC
      """,
      (user_key,),
    )
    routes = cur.fetchall()

    cur.execute(
      """
      SELECT log_id, user_id, "timestamp", latitude, longitude,
             accuracy_meters, speed_mps, activity_type, cell_id, created_at
      FROM location_logs
      WHERE user_id = %s
      ORDER BY "timestamp" ASC
      LIMIT 1200
      """,
      (user_key,),
    )
    logs = cur.fetchall()

  return routine_mirror_summary(profile, routes, logs)


@router.post("/social/routine-mirror/{user_id}/ask", response_model=FollowupAnswerOut)
def ask_routine_mirror(
  user_id: UUID,
  payload: FollowupQuestionIn,
  conn: psycopg.Connection = Depends(get_db),
) -> dict:
  mirror = get_routine_mirror(user_id, conn)
  answer = _routine_answer_with_agent(payload.question, mirror)
  return {"answer": answer}


@router.post("/social/match-coach/{user_id}/{other_user_id}/ask", response_model=FollowupAnswerOut)
def ask_match_coach(
  user_id: UUID,
  other_user_id: UUID,
  payload: FollowupQuestionIn,
  conn: psycopg.Connection = Depends(get_db),
) -> dict:
  user_key = str(user_id)
  other_key = str(other_user_id)

  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT match_id, route_similarity, time_similarity, place_similarity,
             lifestyle_similarity, interest_similarity, final_score, explanation
      FROM user_matches
      WHERE user_id_1 = %s AND user_id_2 = %s
      ORDER BY created_at DESC
      LIMIT 1
      """,
      (user_key, other_key),
    )
    row = cur.fetchone()

  if not row:
    raise HTTPException(status_code=404, detail="Match not found")

  profiles = _latest_profiles(conn)
  interests = _load_interests(conn)
  profile_user = profiles.get(user_key)
  profile_other = profiles.get(other_key)
  if not profile_user or not profile_other:
    raise HTTPException(status_code=400, detail="Routine profiles are missing")

  scores = {
    "route_similarity": row["route_similarity"],
    "time_similarity": row["time_similarity"],
    "place_similarity": row["place_similarity"],
    "lifestyle_similarity": row["lifestyle_similarity"],
    "interest_similarity": row["interest_similarity"],
    "final_score": row["final_score"],
  }

  context = {
    "fit_explanation": match_fit_explanation(
      scores,
      profile_user,
      profile_other,
      interests.get(user_key, set()),
      interests.get(other_key, set()),
    ),
    "discovery_note": new_people_discovery_note(profile_user, profile_other),
    "safe_icebreakers": safe_icebreakers(profile_user, profile_other),
    "first_meet_activities": first_meet_activity_types(profile_user, profile_other),
  }

  return {"answer": _match_answer_with_agent(payload.question, context)}
