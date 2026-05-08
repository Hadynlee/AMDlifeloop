# LifeLoop AI

**Turn everyday routes into real connections.**

LifeLoop AI is a privacy-first lifestyle discovery app that learns repeated movement patterns, summarizes a user's routine, recommends compatible people and nearby places, and generates route-aware missions without exposing real-time location.

The project is built as a mobile-first web app with a FastAPI backend, PostgreSQL/PostGIS database, AI-assisted social workflows, and a Docker Compose setup for local demos.

## Product Overview

Most social and recommendation apps depend on what users manually say they like. LifeLoop AI takes a different approach: it uses approximate routine signals, such as repeated zones, visit timing, dwell duration, and activity categories, to build a private lifestyle profile.

The app then turns that profile into:

- privacy-safe lifestyle summaries
- compatible people recommendations
- local place suggestions
- route-aware missions and rewards
- mutual-friend chat experiences
- profile galleries and account settings

LifeLoop AI is not a live-location tracking app. It is designed around generalized movement patterns, broad routine overlap, and consent-aware social discovery.

## Core Features

### Home

- Mobile-first routine dashboard
- Generalized routine zone map
- Detected daily and monthly movement loops
- Routine Mirror summary powered by routine profile data
- Follow-up chat for routine insights
- Recompute button to rerun the pipeline after data changes

### Matches

- Compatibility cards ranked by route, time, place, lifestyle, and interest similarity
- Match explanations that avoid exact places and timestamps
- Like action for expressing interest
- Match detail modal with similarity breakdown
- Match Coach follow-up questions
- Public profile preview with name, bio, and photo gallery

### Friends

- Liked people list
- Mutual friends list, unlocked when both users like each other
- Weekly social windows based on shared routine patterns
- Place Scout suggestions for safer public meetups
- Friend chat with safety checks and AI-assisted replies when configured

### Places

- Nearby place recommendations generated from routine cells and category fit
- Route-aware mission suggestions
- Reward-style engagement cards
- Google Places support when an API key is configured
- Seeded places fallback for reliable hackathon demos

### Profile

- Mock login and user switching
- Editable profile name and bio
- Profile picture upload
- Four-photo gallery upload with image preview
- Profile settings section
- Privacy controls for tracking, matching, recommendations, and home/work hiding
- Delete location history action
- Logout button that returns to the login screen

## AI Agent Workflows

LifeLoop AI is framed as an agentic lifestyle companion rather than a basic chatbot.

| Agent / Workflow | Role |
| --- | --- |
| Routine Mirror | Summarizes weekly routine patterns and answers follow-up questions. |
| Match Coach | Explains why two users match and suggests safer first interaction ideas. |
| Friend Chat Assistant | Helps generate natural replies while applying safety checks. |
| Recommendation Agent | Ranks places and missions based on route relevance, novelty, and category fit. |
| Privacy Guardrails | Keeps outputs broad, delayed, and lifestyle-based instead of revealing precise location. |

If `SOCIAL_AGENT_API_KEY` or `OPENAI_API_KEY` is configured, the backend can call an OpenAI-compatible chat API for social agent responses. If no key is present, deterministic fallback logic keeps the demo working.

## Privacy Model

Privacy is central to the product design.

- Raw GPS points are converted into approximate area cells.
- Matching uses compressed patterns, not live location.
- Home and work areas can be hidden or generalized.
- Match explanations use lifestyle labels instead of exact venues.
- Users can pause tracking, matching, and recommendations.
- Users can delete stored location history and derived artifacts.
- The frontend avoids showing real-time proximity between users.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript |
| Mobile Preview | Static phone-frame shell served by nginx |
| Backend | FastAPI |
| Database | PostgreSQL + PostGIS |
| Routine Processing | Python services |
| Matching | Weighted similarity scoring |
| Place Recommendations | Seeded places or Google Places |
| Deployment | Docker Compose |

## Project Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── seed.py
│   │   ├── routers/
│   │   │   ├── location.py
│   │   │   ├── matching.py
│   │   │   ├── processing.py
│   │   │   ├── recommendations.py
│   │   │   ├── runtime.py
│   │   │   ├── social.py
│   │   │   └── users.py
│   │   └── services/
│   │       ├── geo.py
│   │       ├── google_places.py
│   │       ├── matching.py
│   │       ├── recommendations.py
│   │       ├── routine.py
│   │       ├── social.py
│   │       └── social_agent.py
│   ├── migrations/
│   │   └── 001_init.sql
│   ├── Dockerfile
│   └── requirements.txt
├── docs/
│   └── architecture.md
├── src/
│   ├── app.js
│   ├── data.js
│   ├── icons.js
│   └── styles.css
├── Dockerfile
├── docker-compose.yml
├── index.html
├── mobile-preview.html
├── nginx.conf
└── README.md
```

## Quick Start

### 1. Start the app

```bash
docker compose up --build -d db api web
```

### 2. Seed demo data

```bash
docker compose exec -T api python -m app.seed --days 35
```

### 3. Open the app

- Mobile preview shell: `http://localhost:8080/`
- Full app view: `http://localhost:8080/index.html`
- FastAPI docs: `http://localhost:8000/docs`

### 4. Stop services

```bash
docker compose down
```

## Environment Variables

Create or update a root `.env` file when using external providers.

```env
SOCIAL_AGENT_API_KEY=
OPENAI_API_KEY=
SOCIAL_AGENT_MODEL=gpt-4.1-mini
SOCIAL_AGENT_BASE_URL=https://api.openai.com/v1
SOCIAL_AGENT_TIMEOUT_SECONDS=20
GOOGLE_PLACES_API_KEY=
GOOGLE_MAPS_API_KEY=
GOOGLE_PLACES_SEARCH_RADIUS_METERS=1500
```

| Variable | Purpose |
| --- | --- |
| `SOCIAL_AGENT_API_KEY` | Primary key for Routine Mirror, Match Coach, and friend chat AI replies. |
| `OPENAI_API_KEY` | Fallback key if `SOCIAL_AGENT_API_KEY` is empty. |
| `SOCIAL_AGENT_MODEL` | Model name for AI social workflows. |
| `SOCIAL_AGENT_BASE_URL` | OpenAI-compatible API base URL. |
| `SOCIAL_AGENT_TIMEOUT_SECONDS` | Timeout for agent calls. |
| `GOOGLE_PLACES_API_KEY` | Enables live place recommendation sourcing. |
| `GOOGLE_MAPS_API_KEY` | Enables Google Maps rendering in the frontend. |
| `GOOGLE_PLACES_SEARCH_RADIUS_METERS` | Search radius for live place lookups. |

The app works without external API keys by using seeded data, mock maps, and local fallback responses.

## Backend API Summary

### Runtime

- `GET /health`
- `GET /runtime/config`

### Users and Privacy

- `POST /users`
- `GET /users`
- `GET /users/{user_id}`
- `PATCH /users/{user_id}/privacy`

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

### Social

- `GET /social/match-coach/{user_id}`
- `POST /social/likes`
- `GET /social/liked/{user_id}`
- `GET /social/friends/{user_id}`
- `GET /social/chats/{user_id}/{friend_user_id}`
- `POST /social/chats/{user_id}/{friend_user_id}/messages`
- `GET /social/routine-mirror/{user_id}`
- `POST /social/routine-mirror/{user_id}/ask`
- `POST /social/match-coach/{user_id}/{other_user_id}/ask`

### Recommendations

- `POST /recommendations/recalculate/{user_id}`
- `GET /recommendations/{user_id}`

## Matching and Recommendation Logic

The backend converts location logs into privacy-safe routine features:

```text
GPS logs
  -> approximate area cells
  -> stay points
  -> compressed daily routes
  -> 30-day routine profile
  -> lifestyle vector
  -> matches and recommendations
```

The match score combines multiple signals:

```text
final_score =
 0.35 * route_similarity
+0.25 * time_similarity
+0.20 * place_similarity
+0.10 * lifestyle_similarity
+0.10 * interest_similarity
```

Recommendations are scored from routine profile category fit, approximate route relevance, novelty, and place metadata. When Google Places is enabled, live places can be fetched and upserted into the local database before scoring.

## Demo Flow

For a judge or teammate demo:

1. Start Docker and seed data.
2. Login with a seeded user such as `jia@example.com`.
3. Open **Home** to show routine zones, detected loops, and Routine Mirror.
4. Open **Matches** to show compatibility cards, profile previews, and Match Coach.
5. Like a recommended person, then open **Friends** to show mutual friends, social windows, place suggestions, and chat.
6. Open **Places** to show route-aware recommendations and missions.
7. Open **Profile** to edit name/bio, upload photos, manage privacy settings, and logout.

## Current Limitations

This is a hackathon-ready MVP, not a production app.

- Mobile GPS collection is simulated through seeded data and web demo flows.
- Authentication is mock/simple and not production-grade.
- Uploaded profile photos and galleries are stored in browser local storage for the frontend demo.
- Privacy controls are implemented for the demo pipeline, but production deployments would need deeper consent, audit, encryption, and retention controls.
- The frontend is a mobile-first web app, not a native iOS or Android application.
- External AI and Google Places features depend on valid API keys.

## Positioning

LifeLoop AI is best described as:

> A privacy-first AI lifestyle companion that turns everyday routines into meaningful social connections, nearby discoveries, and personalized missions.

It is intentionally broader than a dating app. The same routine intelligence can support friendship, activity partners, local exploration, and merchant-sponsored missions while keeping exact real-time location private.
