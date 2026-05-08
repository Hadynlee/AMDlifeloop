from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
  message: str


class UserCreate(BaseModel):
  name: str = Field(min_length=1, max_length=120)
  email: str = Field(min_length=3, max_length=320)


class UserOut(BaseModel):
  user_id: UUID
  name: str
  email: str
  created_at: datetime
  last_active_at: datetime


class PrivacySettingsPatch(BaseModel):
  tracking_enabled: bool | None = None
  matching_enabled: bool | None = None
  show_approx_area: bool | None = None
  allow_recommendations: bool | None = None
  hide_home_area: bool | None = None
  hide_work_area: bool | None = None
  data_retention_days: int | None = Field(default=None, ge=1, le=365)


class PrivacySettingsOut(BaseModel):
  user_id: UUID
  tracking_enabled: bool
  matching_enabled: bool
  show_approx_area: bool
  allow_recommendations: bool
  hide_home_area: bool
  hide_work_area: bool
  data_retention_days: int


class LocationLogIn(BaseModel):
  user_id: UUID
  timestamp: datetime
  latitude: float
  longitude: float
  accuracy_meters: float | None = None
  speed_mps: float | None = None
  activity_type: str | None = None


class LocationBatchIn(BaseModel):
  logs: list[LocationLogIn]


class LocationLogOut(BaseModel):
  log_id: UUID
  user_id: UUID
  timestamp: datetime
  latitude: float
  longitude: float
  accuracy_meters: float | None
  speed_mps: float | None
  activity_type: str | None
  cell_id: str | None
  created_at: datetime


class StayPointOut(BaseModel):
  stay_id: UUID
  user_id: UUID
  start_time: datetime
  end_time: datetime
  duration_minutes: float
  cell_id: str
  centroid_lat: float
  centroid_lng: float
  place_category: str | None
  confidence_score: float


class DailyRouteOut(BaseModel):
  daily_route_id: UUID
  user_id: UUID
  date: date
  compressed_route: list[str]
  main_loop: list[str]
  total_distance_meters: float
  active_minutes: float
  routine_score: float


class RoutineProfileOut(BaseModel):
  profile_id: UUID
  user_id: UUID
  period_start: date
  period_end: date
  frequent_cells: list[dict[str, Any]]
  frequent_place_categories: list[dict[str, Any]]
  common_routes: list[dict[str, Any]]
  time_pattern_vector: dict[str, Any]
  lifestyle_vector: dict[str, float]
  routine_stability: float
  updated_at: datetime


class MatchOut(BaseModel):
  match_id: UUID
  user_id_1: UUID
  user_id_2: UUID
  other_user_name: str | None = None
  route_similarity: float
  time_similarity: float
  place_similarity: float
  lifestyle_similarity: float
  interest_similarity: float
  final_score: float
  explanation: str
  created_at: datetime


class PlaceOut(BaseModel):
  place_id: UUID
  google_place_id: str | None
  name: str
  latitude: float
  longitude: float
  cell_id: str | None
  category: str | None
  rating: float | None
  price_level: int | None
  is_partner: bool


class RecommendationOut(BaseModel):
  recommendation_id: UUID
  user_id: UUID
  place_id: UUID
  reason: str
  score: float
  shown_at: datetime | None
  clicked: bool
  visited: bool
  place: PlaceOut | None = None


class MatchCoachOut(BaseModel):
  match_id: UUID
  user_id_1: UUID
  user_id_2: UUID
  other_user_name: str | None = None
  route_similarity: float
  time_similarity: float
  place_similarity: float
  lifestyle_similarity: float
  interest_similarity: float
  final_score: float
  fit_explanation: str
  discovery_note: str
  like_state: str
  is_mutual: bool
  safe_icebreakers: list[str]
  first_meet_activities: list[str]
  created_at: datetime


class MatchLikeIn(BaseModel):
  from_user_id: UUID
  to_user_id: UUID
  action: str = Field(pattern="^(like|pass)$")


class MatchLikeOut(BaseModel):
  from_user_id: UUID
  to_user_id: UUID
  like_state: str
  is_mutual: bool
  friend_connection_id: UUID | None = None
  safe_icebreakers: list[str]
  first_meet_activities: list[str]


class WeeklyWindowOut(BaseModel):
  label: str
  bucket: str
  daypart: str
  confidence: str


class PlaceScoutOut(BaseModel):
  name: str
  category: str
  rating: float | None = None
  price_level: int | None = None
  reason: str
  score: float


class FriendOut(BaseModel):
  connection_id: UUID
  friend_user_id: UUID
  friend_name: str
  connected_at: datetime
  weekly_windows: list[WeeklyWindowOut]
  place_scout: list[PlaceScoutOut]


class LikedUserOut(BaseModel):
  other_user_id: UUID
  other_user_name: str
  like_state: str
  is_mutual: bool
  weekly_windows: list[WeeklyWindowOut]


class ChatMessageIn(BaseModel):
  sender_user_id: UUID
  body: str = Field(min_length=1, max_length=1200)


class SafetyAlertOut(BaseModel):
  flagged: bool
  reason: str | None = None
  alternatives: list[str] = Field(default_factory=list)


class ChatMessageOut(BaseModel):
  message_id: UUID
  connection_id: UUID
  sender_user_id: UUID
  body: str
  safety_flagged: bool
  safety_reason: str | None
  safety_alternatives: list[str]
  created_at: datetime


class ChatThreadOut(BaseModel):
  connection_id: UUID
  friend_user_id: UUID
  friend_name: str
  weekly_windows: list[WeeklyWindowOut]
  place_scout: list[PlaceScoutOut]
  messages: list[ChatMessageOut]


class FollowupQuestionIn(BaseModel):
  question: str = Field(min_length=1, max_length=1000)


class FollowupAnswerOut(BaseModel):
  answer: str


class RoutineMirrorOut(BaseModel):
  weekly_summary: str
  habit_highlights: list[str]
  energy_pattern: list[str]
  routine_drift_alerts: list[str]


class RuntimeConfigOut(BaseModel):
  map_provider: str
  places_provider: str
  google_maps_api_key: str | None = None
