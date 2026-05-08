CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS privacy_settings (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  matching_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  show_approx_area BOOLEAN NOT NULL DEFAULT TRUE,
  allow_recommendations BOOLEAN NOT NULL DEFAULT TRUE,
  hide_home_area BOOLEAN NOT NULL DEFAULT TRUE,
  hide_work_area BOOLEAN NOT NULL DEFAULT TRUE,
  data_retention_days INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS area_cells (
  cell_id TEXT PRIMARY KEY,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  grid_size_meters INTEGER NOT NULL,
  area_name TEXT,
  place_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS location_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  "timestamp" TIMESTAMPTZ NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_meters DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  activity_type TEXT,
  cell_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED
);

CREATE TABLE IF NOT EXISTS stay_points (
  stay_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes DOUBLE PRECISION NOT NULL,
  cell_id TEXT NOT NULL,
  centroid_lat DOUBLE PRECISION NOT NULL,
  centroid_lng DOUBLE PRECISION NOT NULL,
  place_category TEXT,
  confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_segments (
  route_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  "date" DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  start_cell_id TEXT NOT NULL,
  end_cell_id TEXT NOT NULL,
  cell_sequence JSONB NOT NULL,
  transport_mode TEXT,
  distance_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_routes (
  daily_route_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  "date" DATE NOT NULL,
  compressed_route JSONB NOT NULL,
  main_loop JSONB NOT NULL,
  total_distance_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
  active_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  routine_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, "date")
);

CREATE TABLE IF NOT EXISTS routine_profiles (
  profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  frequent_cells JSONB NOT NULL,
  frequent_place_categories JSONB NOT NULL,
  common_routes JSONB NOT NULL,
  time_pattern_vector JSONB NOT NULL,
  lifestyle_vector JSONB NOT NULL,
  routine_stability DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS user_interests (
  interest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  interest TEXT NOT NULL,
  UNIQUE (user_id, interest)
);

CREATE TABLE IF NOT EXISTS user_matches (
  match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  route_similarity DOUBLE PRECISION NOT NULL,
  time_similarity DOUBLE PRECISION NOT NULL,
  place_similarity DOUBLE PRECISION NOT NULL,
  lifestyle_similarity DOUBLE PRECISION NOT NULL,
  interest_similarity DOUBLE PRECISION NOT NULL,
  final_score DOUBLE PRECISION NOT NULL,
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id_1 <> user_id_2)
);

CREATE TABLE IF NOT EXISTS places (
  place_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id TEXT,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  cell_id TEXT,
  category TEXT,
  rating DOUBLE PRECISION,
  price_level INTEGER,
  is_partner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendations (
  recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(place_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  shown_at TIMESTAMPTZ,
  clicked BOOLEAN NOT NULL DEFAULT FALSE,
  visited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_likes (
  like_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('liked', 'passed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_user_id, to_user_id),
  CHECK (from_user_id <> to_user_id)
);

CREATE TABLE IF NOT EXISTS friend_connections (
  connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_a <> user_b),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES friend_connections(connection_id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  safety_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  safety_reason TEXT,
  safety_alternatives JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_logs_user_time ON location_logs (user_id, "timestamp");
CREATE INDEX IF NOT EXISTS idx_location_logs_cell ON location_logs (cell_id);
CREATE INDEX IF NOT EXISTS idx_location_logs_geom ON location_logs USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_stay_points_user_time ON stay_points (user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_daily_routes_user_date ON daily_routes (user_id, "date");
CREATE INDEX IF NOT EXISTS idx_profiles_user_period ON routine_profiles (user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_matches_user1_score ON user_matches (user_id_1, final_score DESC);
CREATE INDEX IF NOT EXISTS idx_matches_user2_score ON user_matches (user_id_2, final_score DESC);
CREATE INDEX IF NOT EXISTS idx_reco_user_score ON recommendations (user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_social_likes_from_to ON social_likes (from_user_id, to_user_id);
CREATE INDEX IF NOT EXISTS idx_social_likes_to_status ON social_likes (to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_connections_user_a ON friend_connections (user_a);
CREATE INDEX IF NOT EXISTS idx_friend_connections_user_b ON friend_connections (user_b);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conn_time ON chat_messages (connection_id, created_at);
