# LifeLoop AI MVP

LifeLoop AI is a privacy-first routine matching prototype.
It demonstrates that users with similar **monthly routine patterns** can be matched and shown place recommendations using **approximate area cells** instead of raw location trails.

## What This Upgrade Adds

This repo keeps the existing mobile-first web UI and adds a working backend MVP:

- FastAPI backend with all requested API groups
- PostgreSQL + PostGIS schema migration
- Fake-data seed pipeline for users, logs, stay points, routes, profiles, matches, and recommendations
- Privacy-safe matching logic and explanation generation
- Privacy controls in the frontend (pause tracking, pause matching, disable recommendations, delete location history)
- Docker Compose workflow for `db + api + web`

## Stack

- Frontend: existing mobile-optimized web app (HTML/CSS/JS), API-backed
- Backend: FastAPI
- Database: PostgreSQL + PostGIS
- Matching/routine algorithm: Python services in backend
- Runtime: Docker / Docker Compose

Note: this stays in the current app architecture (improve-in-place). The backend contracts are designed so a React Native or Flutter client can be added later without rewriting core logic.

## Project Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── seed.py
│   │   ├── routers/
│   │   └── services/
│   ├── migrations/
│   │   └── 001_init.sql
│   ├── Dockerfile
│   └── requirements.txt
├── docker-compose.yml
├── Dockerfile                # frontend nginx image
├── mobile-preview.html       # phone-frame preview shell
├── index.html
└── src/
    ├── app.js                # API-backed UI logic + fallback
    ├── data.js
    ├── icons.js
    └── styles.css
```

## Quick Start (Docker)

1. Build and start services:

```bash
docker compose up --build -d db api web
```

2. Seed fake MVP data:

```bash
docker compose exec -T api python -m app.seed --days 35
```

3. Open:

- `http://localhost:8080/` phone-layout preview shell (default)
- `http://localhost:8080/index.html` full-width web view
- `http://localhost:8000/docs` FastAPI docs

4. Stop services:

```bash
docker compose down
```

API key config is centralized in the project root `.env` file:
- `GOOGLE_PLACES_API_KEY`: enables live Google Places recommendation sourcing
- `GOOGLE_MAPS_API_KEY`: enables Google Maps rendering in the frontend (falls back to `GOOGLE_PLACES_API_KEY` when empty)
- `GOOGLE_PLACES_SEARCH_RADIUS_METERS`: nearby-search radius for live place fetching

## API Endpoints

### Auth/User

- `POST /users`
- `GET /users/{user_id}`
- `PATCH /users/{user_id}/privacy`
- `GET /users?email=...` (added for mock-login lookup)

### Location

- `POST /location/log`
- `POST /location/batch`
- `GET /location/history/{user_id}`
- `DELETE /location/history/{user_id}`

### Processing

- `POST /process/stay-points/{user_id}`
- `POST /process/daily-routes/{user_id}`
- `POST /process/routine-profile/{user_id}`

### Matching

- `POST /match/recalculate/{user_id}`
- `GET /matches/{user_id}`

### Recommendations

- `POST /recommendations/recalculate/{user_id}`
- `GET /recommendations/{user_id}`

## Implemented Algorithm Functions

In `backend/app/services`:

- `convert_gps_to_cell(lat, lng, grid_size_meters=300)`
- `detect_stay_points(location_logs)` with 150m / 15min rule
- `compress_route(cell_sequence)`
- `build_daily_route_from_logs(...)` and route segment extraction
- `build_routine_profile(...)` for 30-day profile
- `jaccard_similarity(set_a, set_b)`
- `time_pattern_similarity(vector_a, vector_b)`
- `lifestyle_similarity(vector_a, vector_b)` via cosine similarity
- `calculate_match_score(user_a_profile, user_b_profile)`
- `generate_privacy_safe_explanation(scores, profiles)`

Matching formula used:

```text
final_score =
 0.35 * route_similarity
+0.25 * time_similarity
+0.20 * place_similarity
+0.10 * lifestyle_similarity
+0.10 * interest_similarity
```

## Frontend Screens Covered

- Mock login
- Home dashboard
- My routine summary/map
- Match list + match detail modal
- Recommended places page
- Privacy settings page with delete history action

## Privacy Assumptions and Limitations

### Current safeguards

- Matching uses cell-level and compressed pattern data, not exact raw GPS route comparison.
- Explanations avoid exact road names, exact timestamps, live location, and direct home/work disclosure.
- Privacy toggles can disable tracking, matching, and recommendations.
- Delete-history removes raw logs plus derived stay points, routes, profiles, matches, and recommendations.

### MVP limitations

- Frontend map and recommendations auto-switch by env keys:
  - keys present: Google Maps + Google Places live mode
  - keys missing: current mock map + seeded places
- Mobile background GPS collection is simulated in this web MVP and seed data.
- Auth is mock/simple and not production-grade.

## Phase Mapping

- Phase 1 complete: schema, seed, routine/match pipeline, match list demo
- Phase 2 partial: recommendation pipeline in place (mock places)
- Phase 3 pending: real mobile GPS collection client
- Phase 4 partial: privacy toggles + deletion flow implemented
