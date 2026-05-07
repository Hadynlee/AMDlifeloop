from __future__ import annotations

from typing import Any

import httpx

from ..config import settings


def _clean(value: str | None) -> str:
  return (value or "").strip()


def social_agent_api_key() -> str:
  return _clean(settings.social_agent_api_key) or _clean(settings.openai_api_key)


def social_agent_enabled() -> bool:
  return bool(social_agent_api_key())


def _responses_endpoint() -> str:
  base = _clean(settings.social_agent_base_url) or "https://api.openai.com/v1"
  return f"{base.rstrip('/')}/responses"


def _extract_output_text(payload: dict[str, Any]) -> str:
  top = payload.get("output_text")
  if isinstance(top, str) and top.strip():
    return top.strip()

  chunks: list[str] = []
  output = payload.get("output")
  if isinstance(output, list):
    for item in output:
      if not isinstance(item, dict):
        continue
      content = item.get("content")
      if not isinstance(content, list):
        continue
      for piece in content:
        if not isinstance(piece, dict):
          continue
        if piece.get("type") not in {"output_text", "text"}:
          continue
        text = piece.get("text")
        if isinstance(text, str) and text.strip():
          chunks.append(text.strip())

  if chunks:
    return "\n".join(chunks).strip()

  choices = payload.get("choices")
  if isinstance(choices, list):
    for choice in choices:
      if not isinstance(choice, dict):
        continue
      message = choice.get("message")
      if not isinstance(message, dict):
        continue
      content = message.get("content")
      if isinstance(content, str) and content.strip():
        return content.strip()

  return ""


def _error_message(payload: dict[str, Any]) -> str:
  error = payload.get("error")
  if isinstance(error, dict):
    message = error.get("message")
    if isinstance(message, str) and message.strip():
      return message.strip()
  return "Unknown social agent API error"


def generate_social_reply(
  system_prompt: str,
  user_prompt: str,
  *,
  temperature: float = 0.4,
  max_output_tokens: int = 260,
) -> str:
  key = social_agent_api_key()
  if not key:
    raise RuntimeError("Social agent API key is not configured")

  payload = {
    "model": _clean(settings.social_agent_model) or "gpt-4.1-mini",
    "temperature": temperature,
    "max_output_tokens": max_output_tokens,
    "input": [
      {"role": "system", "content": system_prompt},
      {"role": "user", "content": user_prompt},
    ],
  }

  timeout = max(float(settings.social_agent_timeout_seconds or 0.0), 5.0)
  headers = {
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
  }

  try:
    response = httpx.post(_responses_endpoint(), json=payload, headers=headers, timeout=timeout)
  except httpx.HTTPError as exc:
    raise RuntimeError(f"Social agent request failed: {exc}") from exc

  if response.status_code >= 400:
    try:
      data = response.json()
    except ValueError:
      raise RuntimeError(f"Social agent request failed with status {response.status_code}") from None
    raise RuntimeError(_error_message(data))

  try:
    body = response.json()
  except ValueError as exc:
    raise RuntimeError("Social agent returned a non-JSON response") from exc

  text = _extract_output_text(body)
  if not text:
    raise RuntimeError("Social agent returned an empty response")
  return text
