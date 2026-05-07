# LifeLoop MVP Architecture

## High-Level Flow

```text
Mobile/Web client (mock login + mobile-first UI)
        |
        v
FastAPI API layer
  - /location/* ingest
  - /process/* derive routine signals
  - /match/* score compatible users
  - /recommendations/* rank route-relevant places
        |
        v
PostgreSQL + PostGIS
  - raw location_logs
  - generalized cell_id signals
  - stay_points / daily_routes
  - routine_profiles / user_matches / recommendations
```

## Privacy Pipeline

```text
Raw GPS logs
  -> convert_gps_to_cell (300-500m)
  -> detect_stay_points (150m / 15min)
  -> compress_route
  -> build 30-day routine profile
  -> similarity scoring
  -> privacy-safe explanation
```

## Core Modules

- `backend/app/services/geo.py`: grid conversion, route compression, distance helpers
- `backend/app/services/routine.py`: stay detection, daily route build, routine profile generation
- `backend/app/services/matching.py`: score components + weighted final score + safe explanation
- `backend/app/services/recommendations.py`: route/cell/category-based place scoring
- `backend/app/routers/*.py`: endpoint handlers for user, location, processing, matching, recommendations
- `backend/migrations/001_init.sql`: database schema with PostGIS extension
- `backend/app/seed.py`: fake-data seeding and end-to-end preprocessing

## Frontend Integration

The existing static app is preserved and upgraded to API-first behavior:

- Mock login
- User switching
- Recompute button triggers processing/matching pipeline
- Match cards from backend with score breakdown
- Recommendations from backend with reasons
- Privacy toggles patched to backend
- Delete history action cascades deletion of derived artifacts

If backend is unavailable, frontend falls back to local mock data for demo continuity.
