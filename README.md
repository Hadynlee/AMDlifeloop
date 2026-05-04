# LifeLoop AI

LifeLoop AI is a privacy-first lifestyle discovery demo built for an AI agents hackathon. It turns simulated movement routines into lifestyle summaries, compatible connection recommendations, personalized missions, and merchant-style rewards without exposing exact real-time location.

## One-liner

Instead of matching people by swiping profiles, LifeLoop matches people through shared routines, shared places, and shared lifestyles.

## Product Positioning

LifeLoop AI is not pitched as a dating app. It is a broader lifestyle-based social discovery platform that can support friendship, activity buddies, local exploration, dating, and merchant missions.

The core promise:

> LifeLoop AI learns a user's lifestyle from repeated movement patterns, then uses AI agents to recommend compatible people, nearby experiences, and personalized missions without exposing real-time location.

## Demo Features

- Generalized routine map with privacy-safe zones
- Simulated weekly location/lifestyle data for demo users
- AI-style lifestyle summary and inferred tags
- Cosine-similarity matching across lifestyle vectors
- Privacy-safe match explanations
- Personalized mission generation
- Mock rewards marketplace
- Privacy and safety guardrail page

## Project Structure

```text
.
├── index.html          # App entrypoint
├── README.md           # Project documentation
├── assets/             # Reserved for images, logos, or demo screenshots
├── docs/               # Reserved for pitch notes and architecture docs
└── src/
    ├── app.js          # UI rendering, matching logic, and interactions
    ├── data.js         # Simulated users, missions, rewards, and copy
    ├── icons.js        # Inline SVG icon registry
    └── styles.css      # Responsive app styling
```

## How To Run

Open `index.html` directly in a browser.

No install step is required. The app is written with plain HTML, CSS, and JavaScript so it is easy to demo and easy to push to GitHub Pages.

Optional local server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## AI Agent Framing

The MVP represents the product as a multi-agent workflow:

- Routine Understanding Agent: converts repeated movement patterns into lifestyle tags and summaries.
- Matching Agent: compares users with lifestyle vectors and cosine similarity.
- Mission Agent: generates route-relevant exploration missions.
- Privacy and Safety Agent: generalizes sensitive places and hides exact times/locations.
- Business Recommendation Agent: surfaces rewards only when they fit the user's lifestyle.

## Matching Model

Each user has a lifestyle vector:

```js
{
  campus: 0.95,
  sports: 0.88,
  cafe: 0.82,
  nightlife: 0.22,
  nature: 0.25,
  shopping: 0.31,
  food: 0.72,
  fitness: 0.69
}
```

The app uses cosine similarity to calculate the closest lifestyle matches. The UI explains the result in privacy-safe language instead of exposing raw logs.

## Privacy Principles

- Never show real-time location.
- Never reveal exact home, school, or work locations.
- Convert exact places into broad lifestyle zones.
- Use lifestyle labels instead of raw routes.
- Explain matches with generalized routines.
- Show sponsored rewards only when they are lifestyle-relevant.

## Suggested Pitch

Most recommendation apps ask users what they like. LifeLoop AI learns from what users actually do. It analyzes repeated movement patterns to build a private lifestyle profile, then recommends compatible people, nearby experiences, and personalized missions. Unlike dating or location apps, LifeLoop never exposes real-time location or exact routines. It matches people through shared lifestyles, not surveillance.

## Future Improvements

- Replace simulated logs with opt-in mobile location history.
- Add a real AI model for natural-language mission generation.
- Add secure account consent and match opt-in flows.
- Add map provider integration with generalized zones.
- Add merchant dashboard for relevant sponsored missions.
- Add anonymized analytics for route-level business insights.
