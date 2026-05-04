# LifeLoop AI Architecture

## MVP Data Flow

```text
Simulated lifestyle logs
        |
        v
Generalized routine zones
        |
        v
Lifestyle vector and inferred tags
        |
        +--> Matching engine
        |       |
        |       v
        |   Privacy-safe connection cards
        |
        +--> Mission generator
        |       |
        |       v
        |   Route-relevant missions and rewards
        |
        +--> Privacy guardrails
                |
                v
            Redacted user-facing explanations
```

## Core Components

- `src/data.js`: simulated users, routine zones, lifestyle vectors, mission templates, reward copy, and privacy rules.
- `src/app.js`: rendering logic, cosine similarity matching, mission selection, navigation, and user switching.
- `src/icons.js`: inline SVG icons used by the UI.
- `src/styles.css`: responsive dashboard styling.

## Agent Mapping

- Routine Understanding Agent: represented by routine summaries, tags, zones, and metrics.
- Matching Agent: represented by cosine similarity across lifestyle vectors.
- Mission Agent: represented by lifestyle-weighted mission selection.
- Privacy and Safety Agent: represented by generalized wording and explicit privacy rules.
- Business Recommendation Agent: represented by route-relevant mock rewards.

## Production Notes

For a real product, raw location logs should never be directly exposed to the client. A backend service should aggregate and generalize movement data before matching, mission generation, or social display. Sensitive zones such as home, workplace, school, and religious or medical venues should receive stricter redaction rules.
