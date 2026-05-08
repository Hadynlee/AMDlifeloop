from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db import get_db
from ..schemas import PrivacySettingsOut, PrivacySettingsPatch, UserCreate, UserOut

router = APIRouter(tags=["users"])


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, conn: psycopg.Connection = Depends(get_db)) -> dict:
  try:
    with conn.cursor() as cur:
      cur.execute(
        """
        INSERT INTO users (name, email)
        VALUES (%s, %s)
        RETURNING user_id, name, email, created_at, last_active_at
        """,
        (payload.name.strip(), payload.email.strip().lower()),
      )
      user = cur.fetchone()

      cur.execute(
        """
        INSERT INTO privacy_settings (user_id)
        VALUES (%s)
        ON CONFLICT (user_id) DO NOTHING
        """,
        (user["user_id"],),
      )
  except psycopg.errors.UniqueViolation as exc:
    raise HTTPException(status_code=409, detail="Email already exists") from exc

  if not user:
    raise HTTPException(status_code=500, detail="Failed to create user")
  return user


@router.get("/users", response_model=list[UserOut])
def list_users(
  email: str | None = Query(default=None),
  conn: psycopg.Connection = Depends(get_db),
) -> list[dict]:
  with conn.cursor() as cur:
    if email:
      cur.execute(
        """
        SELECT user_id, name, email, created_at, last_active_at
        FROM users
        WHERE lower(email) = lower(%s)
        ORDER BY created_at ASC
        """,
        (email,),
      )
    else:
      cur.execute(
        """
        SELECT user_id, name, email, created_at, last_active_at
        FROM users
        ORDER BY created_at ASC
        """
      )
    rows = cur.fetchall()
  return rows


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: UUID, conn: psycopg.Connection = Depends(get_db)) -> dict:
  with conn.cursor() as cur:
    cur.execute(
      """
      SELECT user_id, name, email, created_at, last_active_at
      FROM users
      WHERE user_id = %s
      """,
      (str(user_id),),
    )
    user = cur.fetchone()

  if not user:
    raise HTTPException(status_code=404, detail="User not found")
  return user


@router.patch("/users/{user_id}/privacy", response_model=PrivacySettingsOut)
def patch_privacy(
  user_id: UUID,
  payload: PrivacySettingsPatch,
  conn: psycopg.Connection = Depends(get_db),
) -> dict:
  updates = payload.model_dump(exclude_none=True)
  if not updates:
    with conn.cursor() as cur:
      cur.execute(
        """
        SELECT user_id, tracking_enabled, matching_enabled, show_approx_area,
               allow_recommendations, hide_home_area, hide_work_area, data_retention_days
        FROM privacy_settings
        WHERE user_id = %s
        """,
        (str(user_id),),
      )
      row = cur.fetchone()
    if not row:
      raise HTTPException(status_code=404, detail="Privacy settings not found")
    return row

  set_clauses = []
  values: list[object] = []
  for key, value in updates.items():
    set_clauses.append(f"{key} = %s")
    values.append(value)
  set_clauses.append("updated_at = NOW()")
  values.append(str(user_id))

  with conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO privacy_settings (user_id)
      VALUES (%s)
      ON CONFLICT (user_id) DO NOTHING
      """,
      (str(user_id),),
    )

    cur.execute(
      f"""
      UPDATE privacy_settings
      SET {', '.join(set_clauses)}
      WHERE user_id = %s
      RETURNING user_id, tracking_enabled, matching_enabled, show_approx_area,
                allow_recommendations, hide_home_area, hide_work_area, data_retention_days
      """,
      tuple(values),
    )
    row = cur.fetchone()

  if not row:
    raise HTTPException(status_code=404, detail="Privacy settings not found")
  return row
