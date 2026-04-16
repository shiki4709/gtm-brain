# GTM Brain

Your second brain for go-to-market. Watch the people who matter, score their posts, draft replies in your voice, and repurpose content across platforms.

## What it does

- **Watchlist Feed** — follow LinkedIn and X accounts, get scored posts ranked by relevance
- **Smart Replies** — AI-drafted replies matched to your brand voice and opinion
- **Repurpose** — turn any post into content for another platform (LinkedIn to X, etc.)
- **Explain Post** — get a plain-English breakdown of why a post matters to you
- **Content Sources** — ingest newsletters, blogs, and RSS into your brain context
- **Brain Chat** — conversational daily briefing and hot takes
- **Notification Settings** — email digest preferences
- **API v1** — external access to discover, reply, repurpose, score, credits, usage, and key management

## Tech stack

- **Next.js 16** / React 19 / TypeScript
- **Supabase** — auth, database, row-level security
- **Claude** (Anthropic) — reply drafting, repurposing, scoring, explanations
- **Apify** — LinkedIn and X scraping
- **Tailwind CSS 4**
- Deployed on **Vercel**

## Getting started

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.local.example .env.local

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ANTHROPIC_API_KEY` | Claude API key |
| `APIFY_TOKEN` | Apify API token for scraping |
| `BRAVE_SEARCH_KEY` | Brave Search API key |
| `SOCIALDATA_API_KEY` | SocialData API key |

### Database migrations

Run the SQL files in `supabase/migrations/` against your Supabase project in order.

## Project structure

```
app/(app)/              # Authenticated app pages
  page.tsx              # Watchlist feed (home)
  settings/             # Notification & account settings
  content-sources/      # Manage content ingestion sources
  developer/            # API key management dashboard
  build-presence/       # Presence building tools
  find-leads/           # Lead discovery
  my-content/           # Content library

app/api/
  v1/                   # Public API (discover, reply, repurpose, score, credits, usage, keys)
  cron/scan/            # Scheduled watchlist scanning
  draft-reply/          # Reply generation
  repurpose/            # Content repurposing
  explain-post/         # Post explanation
  content-sources/      # Content source CRUD + ingestion
  notifications/        # Notification preferences
  watchlist/            # Watchlist management

lib/
  scoring.ts            # Post relevance scoring
  brain-context.ts      # User context assembly for AI prompts
  reply-prompts.ts      # Reply generation prompt templates
  repurpose-prompts.ts  # Repurpose prompt templates
  credits.ts            # API credit system
  rate-limit.ts         # API rate limiting
  api-auth.ts           # API key authentication
  content-ingest.ts     # Content source ingestion pipeline

components/
  brain-chat.tsx        # Conversational briefing UI
  nav.tsx               # App navigation

supabase/
  schema.sql            # Base database schema
  migrations/           # Incremental migrations
```

## Deployment

Deployed on Vercel. Push to `main` to deploy.
