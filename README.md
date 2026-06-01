# Feedback Analytics — Cloudflare Workers

A serverless feedback analytics pipeline deployed on Cloudflare Workers. Incoming feedback is scored for sentiment and bot probability using AI inference, assigned a weighted pain score by user tier, indexed for semantic search, and surfaced in a live dashboard.

Built entirely on Cloudflare's developer platform: Workers, D1, Workers AI, and AI Search.

---

## What it does

When feedback is submitted, the worker:

1. **Runs sentiment analysis** via `distilbert-sst-2-int8` (Workers AI) and maps the result to a 1–5 score
2. **Estimates bot probability** via `llama-3.1-8b-instruct` with a heuristic fallback for malformed responses
3. **Calculates a pain score** — `(6 - sentiment) × tier_weight` — so that negative feedback from Enterprise customers ranks higher than the same complaint from a Free user
4. **Persists to D1** (Cloudflare's SQLite-at-the-edge) with full metadata
5. **Indexes the content in AI Search** asynchronously so it's available for semantic similarity queries

The dashboard aggregates all of this into metrics, charts, AI-generated insights, and a filterable feedback table — auto-refreshing every 60 seconds.

---

## Architecture

```
POST /submit
    → validate input
    → sentiment analysis     (Workers AI — distilbert)
    → bot detection          (Workers AI — llama-3.1-8b)
    → compute pain score
    → insert into D1
    → index in AI Search     (async, via ctx.waitUntil)

GET /api/search?q=<query>
    → semantic search via AI Search
    → hydrate results from D1
    → return ranked matches with similarity scores

GET /?period=<day|week|month|year>
    → query D1 for time window
    → generate AI insights + recommendations  (llama-3.1-8b)
    → extract themes per feedback item
    → render HTML dashboard
```

---

## Pain Score Formula

```
pain_score = (6 - sentiment_score) × tier_weight

tier_weight:
  Enterprise → 3
  Pro        → 2
  Free       → 1
```

A score of 1 (very negative) from an Enterprise user produces a pain score of 15. The same complaint from a Free user scores 5. This surfaces high-value customer frustration at the top of the queue.

---

## API

**Submit feedback**
```bash
POST /submit
Content-Type: application/json

{
  "content": "The API rate limits are too aggressive",
  "source": "support-ticket",
  "user_tier": "Enterprise"
}
```

Response:
```json
{
  "id": 42,
  "sentiment_score": 2,
  "bot_score": 0.05,
  "pain_score": 12,
  "status": "submitted"
}
```

**Semantic search**
```bash
GET /api/search?q=rate+limiting+issues
```

Returns feedback ranked by semantic similarity, merged with D1 metadata including pain score and tier.

**Dashboard**
```bash
GET /?period=week
```

Renders the live HTML dashboard for the selected time window (`day`, `week`, `month`, `year`).

---

## Database Schema

```sql
CREATE TABLE feedback (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    content        TEXT    NOT NULL,
    source         TEXT    NOT NULL,
    user_tier      TEXT    NOT NULL CHECK(user_tier IN ('Enterprise', 'Pro', 'Free')),
    sentiment_score INTEGER NOT NULL CHECK(sentiment_score BETWEEN 1 AND 5),
    bot_score      REAL    NOT NULL CHECK(bot_score BETWEEN 0 AND 1),
    pain_score     REAL    NOT NULL,
    vibe_summary   TEXT,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Indexed on `created_at`, `source`, `user_tier`, and `sentiment_score`.

---

## Deploy

**Prerequisites:** Cloudflare account with Workers, D1, Workers AI, and AI Search enabled.

```bash
npm install

# Create D1 database
npx wrangler d1 create feedback-db
# Update the database_id in wrangler.jsonc with the output

# Run migrations
npx wrangler d1 execute feedback-db --file=migrations/schema.sql

# Deploy
npx wrangler deploy
```

**Test locally:**
```bash
npx wrangler dev

curl -X POST http://localhost:8787/submit \
  -H "Content-Type: application/json" \
  -d '{"content": "Login is broken", "source": "in-app", "user_tier": "Pro"}'
```

---

## Tech Stack

TypeScript · Cloudflare Workers · Cloudflare D1 · Workers AI (`distilbert-sst-2-int8`, `llama-3.1-8b-instruct`) · AI Search · Wrangler
