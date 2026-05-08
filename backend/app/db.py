from pathlib import Path
from typing import Generator

import psycopg
from psycopg.rows import dict_row

from .config import settings


def connect() -> psycopg.Connection:
  return psycopg.connect(settings.database_url, row_factory=dict_row)


def get_db() -> Generator[psycopg.Connection, None, None]:
  conn = connect()
  try:
    yield conn
    conn.commit()
  except Exception:
    conn.rollback()
    raise
  finally:
    conn.close()


def run_migrations() -> None:
  sql_path = Path(__file__).resolve().parents[1] / "migrations" / "001_init.sql"
  if not sql_path.exists():
    return

  with connect() as conn:
    with conn.cursor() as cur:
      cur.execute(sql_path.read_text(encoding="utf-8"))
    conn.commit()
