# PRD: Unified GTM Dashboard

## What is this

A single web app that runs your entire GTM — finding leads, engaging on X, creating content — organized around two motions: outbound (leads from other people's content) and inbound (leads from your own content). Every action feeds a learning system that gets smarter about your market over time.

This is the first deployment of what becomes Syval — the second brain for GTM.

## Market context & competitive positioning

### The thesis (validated)

The GTM tool market is $4.1B (2025) heading to $15B by 2030. 81% of sales teams use AI tools. But **53% of GTM leaders see no impact from AI** — the gap is workflow vs tool. Teams that stitch together clear workflows (LLM + Clay + Zapier) win. Teams that buy tools and hope, don't.

Warmly.ai coined "The GTM Brain" — a system that owns decisions, not just data. Their thesis: "Owning data means having information. Owning decisions means having a system that can reason over all that data, determine the best next action, and learn from the outcome." This validates Syval's approach.

Sources: [Warmly GTM Brain](https://www.warmly.ai/p/blog/gtm-brain-own-decisions), [Primary VC GTM Thesis 2026](https://www.primary.vc/articles/primarys-2026-investment-thesis-for-gtm-tech), [State of AI for GTM 2026](https://knowledge.gtmstrategist.com/p/the-2026-state-of-ai-for-gtm-workflows)

### Competitive landscape

| Tool | What it does | Price | Gap Syval fills |
|------|-------------|-------|----------------|
| **Clay** | Data enrichment, 150+ providers, waterfall enrichment | $149-$800/mo | Gives you data, doesn't learn what works for YOUR market |
| **Apollo.io** | Prospecting + email sequences | $49-$119/mo | Database of contacts, no engagement-based discovery |
| **Instantly.ai** | Cold email at scale, deliverability | $30-$77/mo | Email volume, no LinkedIn, no content loop |
| **Lemlist** | Personalized email + LinkedIn outreach | $39-$159/mo | Multi-channel sequences, no learning system |
| **Warmly.ai** | Website visitor identification + GTM brain | Enterprise pricing | Full GTM brain but for enterprise, not solo founders |
| **Syval** | Second brain for GTM — learns your market | Free → TBD | Market-specific intelligence that improves weekly, for one person, not a team |

### Syval's differentiation

1. **Learns your specific market.** Clay enriches data. Apollo has a database. Neither knows that VP-level titles from engineering hiring posts reply 3x more to comment-reference DMs in YOUR industry. Syval does — after 2 weeks of use.

2. **Workflow, not tool.** 53% of GTM leaders see no AI impact because they buy tools. Syval IS the workflow — scrape → filter → draft → send → track → learn → repeat. Every step connected.

3. **Engagement-based lead discovery.** Apollo/Clay give you a list of people who match a profile. Syval gives you people who are ALREADY ENGAGING with relevant content — warmer leads by definition.

4. **Solo founder pricing.** Warmly's GTM Brain costs enterprise money. Clay + Apollo + Instantly + Lemlist = $300-$1000/mo. Syval replaces the stack for a solo GTM hire.

### Validated assumptions

| Assumption | Evidence |
|-----------|---------|
| Personalized DMs outperform generic | 9.4% reply rate personalized vs 5.4% generic ([Alsona 2025](https://www.alsona.com/blog/linkedin-messaging-benchmarks-whats-a-good-reply-rate-in-2025)) |
| Comment-reference DMs are best | Signal-based personalization reaches 2-3x median reply rate ([Expandi 2025](https://expandi.io/blog/state-of-li-outreach-h1-2025/)) |
| Inbound + outbound integration wins | "Best B2B companies don't choose — they combine both" ([Data-Mania 2026](https://www.data-mania.com/blog/inbound-vs-outbound-sales-gtm-engineer-workflow/)) |
| Data flywheel is the moat | "GTM data is your greatest strategic asset — every interaction feeds a proprietary flywheel" ([Primary VC](https://www.primary.vc/articles/primarys-2026-investment-thesis-for-gtm-tech)) |
| AI workflow > AI tool | 53% of leaders see no AI impact — winners build workflows, not buy tools ([GTM Strategist 2026](https://knowledge.gtmstrategist.com/p/the-2026-state-of-ai-for-gtm-workflows)) |

## Who is it for

**Primary user:** First GTM hire at an early-stage startup (Maruthi at Nevara). Needs to prove outbound works with no budget for expensive sales tools. Currently scrolling LinkedIn manually.

**ICP for this user's ICP:** VP Engineering, CTO, Head of Product, Director Engineering at Series A-C companies.

## The two motions

### Outbound — "I need leads now"

Find leads from OTHER people's high-engagement posts. Time to value: minutes.

```
Find/search posts → Scrape engagers → Filter to ICP → Draft DMs → Send → Track replies
```

### Inbound — "I want leads to come to me"

Publish content that attracts YOUR target buyers, then scrape your own engagers. Time to value: weeks.

```
Generate content → Publish → Engagers interact → Scrape your post → ICP leads from your content
Stay active on X → Reply to relevant tweets → Build visibility → Attract inbound
```

### The learning loop (second brain)

Every action feeds data back:

| Data | What accumulates | What the system learns |
|------|-----------------|----------------------|
| Scrapes | Post URL, topic, engager count, ICP match rate | Which topics attract ICP-quality leads |
| Leads | Name, title, company, source post, status | Which ICP titles engage most |
| DMs | Draft text, angle used, sent timestamp | Which DM angles get replies |
| Replies | Who replied, from which post/DM | Full attribution: topic → lead → DM → reply |
| Content | Published posts, platform, topic | What content attracts inbound leads |
| X engagement | Tweets replied to, accounts watched | Which conversations build visibility |

The brain surfaces insights: "Posts about engineering hiring yield 3x more ICP leads. DMs referencing comments get 23% reply rate vs 8% for generic."

## Information architecture

### Tabs

```
Overview | Outbound | Inbound
```

No tool names. No "Hawki", "Pingi", "Foxxi" in the UI.

### Overview tab

**Purpose:** What needs your attention right now + high-level stats.

**Components:**
- Brain insight card — this week's top learning (from `sb_insights`)
- Stats row — ICP leads, DMs sent, replies, X replies posted, content published
- Action items — prioritized list of what needs attention, each tagged outbound/inbound:
  - "23 new ICP leads to review" → links to Outbound
  - "8 DMs drafted, ready to send" → links to Outbound
  - "5 tweets worth replying to" → links to Inbound
  - "2 leads replied to your DM" → links to Outbound
  - "1 post ready to publish" → links to Inbound
- Activity feed — recent actions across all tools, tagged outbound/inbound

**Data source:** All from Supabase. Action items are computed queries (e.g., "leads WHERE status = 'icp_filtered' AND NOT viewed").

### Outbound tab

**Purpose:** Find leads from other people's posts, DM them, track the pipeline.

**Components:**
1. **Scrape input** — paste LinkedIn post URL, click Scrape
2. **Post finder** — search by keyword (Brave Search API), results with View + Scrape buttons
3. **Watch list** — influencers to monitor, "Scrape latest" per influencer
4. **Pipeline visualization** — scraped → ICP filtered → DM drafted → DM sent → replied → meeting booked
5. **Lead list** — sortable/filterable, with:
   - Name, title, company
   - Source post + topic
   - Comment text (if commenter)
   - ICP badge
   - Status badge (new / DM drafted / sent / replied)
   - "Draft DM" button → opens Claude-generated DM
   - "View" → opens LinkedIn profile
6. **Sales Nav CSV export** — ICP leads with First Name, Last Name, Title, Company, LinkedIn URL
7. **Replied leads** — leads who replied, with reply snippet and source attribution

**API routes:**
- `POST /api/scrape` — start Apify scrape (multi-batch offsets for full coverage)
- `POST /api/scrape/poll` — poll for scrape completion
- `POST /api/find-posts` — Brave Search API for LinkedIn posts
- `POST /api/draft-dm` — Claude Haiku generates personalized DM
- `POST /api/export-csv` — generate Sales Nav CSV

### Inbound tab

**Purpose:** Create content, stay active on X, track inbound lead generation.

**Sections:**

**Content creation:**
1. Source input — paste URL, text, or notes
2. Brain suggestion — "Based on your lead data, post about [topic]"
3. Generate button → LinkedIn post + X thread side by side
4. Editable textareas per platform
5. Copy button per platform

**X engagement:**
1. Watched accounts + topics (from ICP setup)
2. "Find tweets" — surfaces recent tweets from watched accounts/topics
3. Each tweet: author, text, engagement stats, View on X, Draft Reply
4. Draft Reply → Claude generates contextual reply, editable, Copy & Post
5. Telegram setup card — step-by-step connect to @pingi_x_bot for real-time push

**Your posts:**
1. Published post history with engagement data
2. "Scrape engagers" button per post — feeds leads back to outbound pipeline as `source_type = 'inbound'`

**API routes:**
- `POST /api/generate` — Claude Sonnet generates LinkedIn + X content
- `POST /api/x-engage` — SocialData API fetches tweets from accounts/topics
- `POST /api/draft-reply` — Claude Haiku generates X reply

### Onboarding (first visit)

**Purpose:** One setup that configures everything.

**Flow:**
1. "Who are you trying to reach?" — enter target ICP titles + exclusions
2. ICP auto-populates:
   - Outbound: lead filtering keywords
   - Inbound: suggested X accounts and topics based on ICP
   - Content: audience targeting for generation
3. "Set up my GTM tools" → all tabs become available
4. Optional: Telegram setup for X engagement push notifications

**Data saved:** `sb_users.icp_config` (JSON: titles + exclude arrays)

## Second Brain — Detailed Design

The second brain is not a feature or a page. It's a system that runs across every action in the app. Every scrape, every DM, every reply, every post feeds data into a learning layer that surfaces patterns the user can't see manually.

### Framework: Simplified OODA+L

Inspired by Warmly's [GTM Brain OODA+L loop](https://www.warmly.ai/p/blog/gtm-brain-own-decisions), adapted for a solo founder:

```
OBSERVE  — Scrape posts, surface tweets, track DMs sent
ORIENT   — Filter to ICP, tag topics, classify DM angles
DECIDE   — Brain surfaces: "post about X", "DM angle Y works better", "scrape on Tuesdays"
ACT      — User sends DMs, replies to tweets, publishes content
LEARN    — Track outcomes (reply rate, ICP match rate, conversion), update insights
→ Loop restarts with better data
```

Enterprise GTM brains (Warmly, 6sense) do this with intent data, website visitors, and CRM signals. Syval does it with engagement data, DM outcomes, and content performance — the signals a solo founder actually has.

### Architecture: Atomic → Composite → Playbook

Following [goose-skills](https://github.com/gooseworks-ai/goose-skills) pattern of separating capabilities into three layers:

**Atomic (single actions):**
- Scrape a LinkedIn post → leads
- Draft a DM for a lead
- Generate a LinkedIn post from source material
- Search for tweets by account/topic
- Draft a reply to a tweet
- Extract topic from a post URL

**Composite (chained actions):**
- Outbound chain: find post → scrape → filter ICP → draft DMs → track sent
- Inbound chain: generate content → publish → scrape your post's engagers → filter ICP
- X engage chain: surface tweets → draft replies → post → track engagement

**Playbook (weekly GTM loop):**
```
Monday:    Scrape 5 posts (brain suggests topics) → review ICP leads → draft DMs
Tuesday:   Send DMs (brain suggests best angle) → reply to 5 X tweets
Wednesday: Publish LinkedIn post (brain suggests topic) → reply to X tweets
Thursday:  Scrape your own post's engagers → DM inbound ICP leads
Friday:    Brain generates weekly summary → adjust ICP/topics for next week
```

The brain improves each step of the playbook over time. Week 1 is generic. Week 4 is customized to your market.

### How data flows in

Every user action creates a data trail:

```
User pastes post URL
  → sb_scrapes: post_url, post_topic (AI-extracted), scrape_date
  → sb_leads: name, title, company, comment_text, icp_match, source_type

User drafts DM
  → sb_leads.dm_draft, sb_leads.dm_angle (comment_reference | title_based | generic)

User marks DM as sent
  → sb_leads.status = 'dm_sent', sb_leads.dm_sent_at

Lead replies
  → sb_leads.status = 'replied', sb_leads.replied_at
  → sb_replies: lead_id, reply_snippet, detected_via

User publishes content
  → sb_posts: platform, content, topic, published_at

User scrapes their own post
  → sb_leads with source_type = 'inbound', linked to sb_posts

User replies to tweet
  → sb_x_engage: tweet_id, author_handle, draft_reply, status = 'posted'
```

### How insights are generated

Insights are computed queries, not ML. They run on a schedule (daily) or on-demand when the user opens the Overview tab.

**Insight type: `topic_performance`**

```sql
-- Which post topics yield the highest ICP match rate?
SELECT
  post_topic,
  COUNT(*) as scrape_count,
  AVG(icp_matches::float / NULLIF(total_engagers, 0)) as avg_icp_rate,
  SUM(icp_matches) as total_icp_leads
FROM sb_scrapes
WHERE user_id = ? AND post_topic IS NOT NULL
GROUP BY post_topic
HAVING COUNT(*) >= 2
ORDER BY avg_icp_rate DESC
```

Output: `{"topic": "engineering hiring", "avg_icp_rate": 0.12, "scrape_count": 8, "total_icp_leads": 47}`

Confidence: `min(scrape_count / 10, 1.0)` — needs 10+ scrapes for full confidence.

**Insight type: `icp_pattern`**

```sql
-- Which ICP titles appear most and which respond to DMs?
SELECT
  title_keyword,
  COUNT(*) as appearances,
  COUNT(*) FILTER (WHERE status = 'dm_sent') as dms_sent,
  COUNT(*) FILTER (WHERE status = 'replied') as replies,
  ROUND(COUNT(*) FILTER (WHERE status = 'replied')::float /
        NULLIF(COUNT(*) FILTER (WHERE status = 'dm_sent'), 0), 2) as reply_rate
FROM sb_leads,
     LATERAL unnest(string_to_array(?, ',')) AS title_keyword
WHERE user_id = ? AND icp_match = true
  AND lower(title) LIKE '%' || lower(trim(title_keyword)) || '%'
GROUP BY title_keyword
ORDER BY appearances DESC
```

Output: `{"title": "VP Growth", "appearances": 47, "dms_sent": 12, "replies": 3, "reply_rate": 0.25}`

**Insight type: `dm_effectiveness`**

```sql
-- Which DM angles get the best reply rate?
SELECT
  dm_angle,
  COUNT(*) as sent,
  COUNT(*) FILTER (WHERE status = 'replied') as replies,
  ROUND(COUNT(*) FILTER (WHERE status = 'replied')::float /
        NULLIF(COUNT(*), 0), 2) as reply_rate
FROM sb_leads
WHERE user_id = ? AND status IN ('dm_sent', 'replied') AND dm_angle IS NOT NULL
GROUP BY dm_angle
```

Output: `{"angle": "comment_reference", "sent": 20, "replies": 6, "reply_rate": 0.30}`

**Insight type: `inbound_vs_outbound`**

```sql
-- How does inbound compare to outbound?
SELECT
  source_type,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE icp_match) as icp_matches,
  COUNT(*) FILTER (WHERE status = 'replied') as replies,
  ROUND(COUNT(*) FILTER (WHERE status = 'replied')::float /
        NULLIF(COUNT(*) FILTER (WHERE status = 'dm_sent'), 0), 2) as reply_rate
FROM sb_leads
WHERE user_id = ?
GROUP BY source_type
```

Output: `{"source_type": "inbound", "total_leads": 47, "icp_matches": 12, "replies": 4, "reply_rate": 0.33}`

**Insight type: `timing`**

```sql
-- When do ICP leads engage most?
SELECT
  EXTRACT(dow FROM scrape_date) as day_of_week,
  AVG(icp_matches::float / NULLIF(total_engagers, 0)) as avg_icp_rate
FROM sb_scrapes
WHERE user_id = ?
GROUP BY day_of_week
ORDER BY avg_icp_rate DESC
```

Output: `{"best_day": "tuesday", "avg_icp_rate": 0.15, "worst_day": "sunday", "worst_rate": 0.04}`

**Insight type: `weekly_summary`**

Generated by Claude from all other insights + raw stats:

```
Input to Claude:
- This week: 8 scrapes, 142 ICP leads, 34 DMs sent, 7 replies
- Top topic: engineering hiring (12% ICP rate)
- Top ICP title: VP Engineering (25% reply rate)
- Best DM angle: comment_reference (30% reply rate)
- Inbound vs outbound: inbound reply rate 33% vs outbound 18%

Claude generates:
"Posts about engineering hiring yield 3x more ICP leads than product launches.
DMs referencing comments get 23% reply rate vs 8% for generic. Your inbound
content is converting better than outbound — post more about hiring challenges."
```

### Where insights surface in the UI

| Location | What shows | Trigger |
|----------|-----------|---------|
| **Overview — brain card** | This week's top insight (weekly_summary) | On page load, refreshed daily |
| **Overview — action items** | "Suggested: post about [topic]" based on topic_performance | On page load |
| **Outbound — above lead list** | "DMs referencing comments get 3x more replies" if dm_effectiveness has data | On page load |
| **Outbound — pipeline** | Reply rate per stage with trend arrows | Computed on render |
| **Inbound — content suggestion** | "Based on your lead data, post about [topic]" from topic_performance | On page load |
| **Inbound — your posts** | ICP match rate per published post | After scraping your own post |

### Confidence scoring

Each insight has a confidence score from 0 to 1:

| Score | Label | Shown as | Meaning |
|-------|-------|----------|---------|
| 0 - 0.3 | Low | Gray text, "early signal" | <3 data points, might be noise |
| 0.3 - 0.7 | Medium | Normal text | 3-10 data points, likely real |
| 0.7 - 1.0 | High | Bold, highlighted | 10+ data points, confident |

Formula varies by type:
- `topic_performance`: `min(scrape_count / 10, 1.0)`
- `icp_pattern`: `min(appearances / 20, 1.0)`
- `dm_effectiveness`: `min(sent / 15, 1.0)`
- `inbound_vs_outbound`: `min((inbound_leads + outbound_leads) / 50, 1.0)`

### How insights improve over time

**Week 1:** Only `topic_performance` and `icp_pattern` have data. Low confidence. "Early signal: posts about hiring seem to attract more ICP leads."

**Week 3:** `dm_effectiveness` kicks in (enough DMs sent). Medium confidence. "DMs referencing comments get 2x more replies than generic."

**Month 1:** All insight types active. `inbound_vs_outbound` has data. High confidence on topics. "Your inbound content converts 33% better than outbound. Post more about [topic]."

**Month 2:** `weekly_summary` shows trends. "Your reply rate improved from 8% to 21% over 4 weeks. The biggest driver: switching from generic DMs to comment-reference DMs."

**Month 3+:** Cross-user insights (if 3+ users). "Across all users, DMs referencing comments get 2.3x more replies. VP-level titles reply 40% more than Director-level."

### How insights feed back into actions

The brain doesn't just observe — it changes what the tools do:

| Insight | Feeds into | How |
|---------|-----------|-----|
| `topic_performance` | Inbound content suggestions | "Post about [top topic]" card in Content section |
| `topic_performance` | Post finder ranking | Sort found posts by topic match to high-performing topics |
| `icp_pattern` | ICP filter refinement | "Add 'VP Growth' to your ICP? It appeared 47 times." |
| `dm_effectiveness` | DM drafting prompt | Inject winning angle into Claude prompt: "Use comment_reference style" |
| `timing` | Scrape suggestions | "Scrape on Tuesdays — your ICP is 3x more active" |
| `inbound_vs_outbound` | Overview priority | Emphasize whichever motion is converting better |
| `weekly_summary` | Overview brain card | Human-readable summary of what worked |

### Topic extraction

Every scrape needs a topic tag for the brain to work. This happens automatically:

```
POST /api/extract-topic
Input: { post_url, post_title_from_url }
Claude Haiku prompt: "Given this LinkedIn post URL and title, extract a 1-3 word topic tag.
  Examples: 'engineering hiring', 'product launches', 'sales playbook', 'remote work'.
  Output only the topic tag, nothing else."
Output: "engineering hiring"
→ Saved to sb_scrapes.post_topic
```

Cost: ~$0.001 per extraction (Haiku). Runs once per scrape.

### DM angle tagging

Every drafted DM gets tagged with its angle so we can measure effectiveness:

```
If DM references the lead's comment text → angle = 'comment_reference'
If DM references the lead's title/role → angle = 'title_based'
If DM references the post topic only → angle = 'topic_based'
If none of the above → angle = 'generic'
```

This is a simple string match on the drafted DM text, not an AI call. Tagged at draft time, saved to `sb_leads.dm_angle`.

## Database schema

Shared Supabase project. All tables prefixed `sb_` for Syval namespace.

```sql
-- Users
CREATE TABLE sb_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  name TEXT,
  icp_config JSONB DEFAULT '{"titles":[],"exclude":[]}',
  x_accounts JSONB DEFAULT '[]',
  x_topics JSONB DEFAULT '[]',
  telegram_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scrapes
CREATE TABLE sb_scrapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  post_url TEXT NOT NULL,
  post_author TEXT,
  post_topic TEXT,
  platform TEXT DEFAULT 'linkedin',
  total_engagers INT DEFAULT 0,
  icp_matches INT DEFAULT 0,
  scrape_date TIMESTAMPTZ DEFAULT now()
);

-- Leads
CREATE TABLE sb_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_id UUID REFERENCES sb_scrapes(id),
  user_id UUID REFERENCES sb_users(id),
  name TEXT,
  title TEXT,
  company TEXT,
  linkedin_url TEXT,
  comment_text TEXT,
  icp_match BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'scraped',
  -- status: scraped → icp_filtered → dm_drafted → dm_sent → replied → converted
  dm_draft TEXT,
  dm_angle TEXT,
  dm_sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  source_type TEXT DEFAULT 'outbound',
  -- source_type: outbound (other's post) | inbound (your post)
  viewed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Replies
CREATE TABLE sb_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES sb_leads(id),
  user_id UUID REFERENCES sb_users(id),
  detected_via TEXT DEFAULT 'manual',
  reply_snippet TEXT,
  detected_at TIMESTAMPTZ DEFAULT now()
);

-- Published content
CREATE TABLE sb_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  platform TEXT NOT NULL,
  content TEXT,
  topic TEXT,
  post_url TEXT,
  published_at TIMESTAMPTZ,
  engagers_scraped INT DEFAULT 0,
  icp_from_post INT DEFAULT 0
);

-- X engagement
CREATE TABLE sb_x_engage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  tweet_id TEXT,
  tweet_url TEXT,
  author_handle TEXT,
  author_name TEXT,
  tweet_text TEXT,
  draft_reply TEXT,
  status TEXT DEFAULT 'surfaced',
  -- status: surfaced → drafted → posted → skipped
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Brain insights
CREATE TABLE sb_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  insight_type TEXT NOT NULL,
  -- types: topic_performance, icp_pattern, dm_effectiveness, timing, weekly_summary
  insight_data JSONB NOT NULL,
  confidence FLOAT DEFAULT 0.5,
  generated_at TIMESTAMPTZ DEFAULT now()
);
```

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 14 (App Router) | Foxxi already uses it, SSR for SEO, API routes built in |
| Language | TypeScript | Type safety, shared types across client/server |
| Database | Supabase (Postgres) | Pingi already uses it, auth built in, real-time subscriptions |
| Styling | Tailwind CSS | Fast, consistent, design system via config |
| AI | Anthropic Claude (Haiku for drafts, Sonnet for content) | Already integrated in all three agents |
| Search | Brave Search API | Post finder, $5/mo for 1000 queries |
| X data | SocialData API | Tweet fetching, same as Pingi uses |
| Scraping | Apify | LinkedIn post engager scraping, same as Hawki |
| Deploy | Vercel | Already used for all three agents |

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
APIFY_TOKEN=
BRAVE_SEARCH_KEY=
SOCIALDATA_API_KEY=
BRAND_NAME=Nevara GTM        # changes to "Syval" later
```

## White-label design

The app is white-labeled via env vars so the same codebase deploys as Nevara GTM today and Syval tomorrow.

| Env var | Nevara deploy | Syval deploy |
|---------|--------------|-------------|
| `BRAND_NAME` | Nevara GTM | Syval |
| `BRAND_COLOR` | — (default blue) | — (default blue) |
| Default ICP | VP Eng, CTO, Head of Product | Generic sales ICP |
| Domain | nevara-gtm.vercel.app | app.syvalapp.com |

## Auth

**Phase 1 (now):** No auth. Single user. `user_id` hardcoded or from a simple email cookie. Good enough for Maruthi.

**Phase 2 (Week 2):** Supabase Auth with magic link. Multi-user. Each user has their own ICP, scrapes, leads, and insights.

## What we're NOT building

- CRM features (deal stages, revenue tracking, pipeline management)
- Auto-posting to LinkedIn or X (copy-to-clipboard only, user posts manually)
- Auto-connection requests (too risky for LinkedIn flagging)
- Reddit, HN, Quora engagement (deferred to Month 2+)
- Mobile app
- Billing / Stripe

## Success criteria

Based on validated industry benchmarks ([Alsona 2025](https://www.alsona.com/blog/linkedin-messaging-benchmarks-whats-a-good-reply-rate-in-2025), [Expandi 2025](https://expandi.io/blog/state-of-li-outreach-h1-2025/), [SalesBread 2026](https://salesbread.com/linkedin-outreach-stats/)):

| Metric | Target | Benchmark | Why achievable |
|--------|--------|-----------|---------------|
| Maruthi uses it daily | 3x/week for 2 weeks | — | Product stickiness test |
| Leads persist across sessions | 100% — no data loss | — | Supabase backend |
| DM reply rate | >15% | Industry avg 5-8%, personalized 9.4% | Comment-reference DMs reach 2-3x median |
| Connection request acceptance | >40% | Personalized: 45%, generic: 15% | All DMs reference engagement context |
| Time from post URL to drafted DMs | <2 minutes | Manual: 4+ hours/week | Scrape + filter + AI draft |
| X engagement | 5+ replies/week | — | Surfaced tweets + AI drafts lower the bar |
| Content published | 2+ posts/week | — | Generate from any source in seconds |
| First brain insight | After 1 week | — | Needs 5+ scrapes for topic_performance |
| Brain-suggested DM angle outperforms generic | >2x reply rate | Signal-based: 2-3x median | Validated by Expandi data |

## Build order

| Step | What | Est |
|------|------|-----|
| 1 | Supabase project + schema | 30 min |
| 2 | App layout — tabs (Overview / Outbound / Inbound), onboarding gate | 1h |
| 3 | Outbound — scrape API + lead list + DM drafting + pipeline | 2h |
| 4 | Outbound — post finder + watch list + Sales Nav export | 1h |
| 5 | Inbound — content generation (LinkedIn + X) | 1h |
| 6 | Inbound — X engage (SocialData + draft reply) + Telegram card | 1h |
| 7 | Overview — stats + action items + activity feed from DB | 1h |
| 8 | Brain — first insight generation (topic performance) | 1h |
| 9 | Polish — error handling, loading states, mobile responsive | 1h |
| **Total** | | **~9.5h** |

## Relationship to existing repos

| Repo | What happens to it |
|------|-------------------|
| `shiki4709/hawki` | Stays alive as standalone LinkedIn scraper. API logic ported to nevara-gtm. |
| `shiki4709/pingi-ai` | Stays alive as Telegram X bot. SocialData + draft logic ported. Telegram bot stays in Pingi. |
| `shiki4709/foxxi` | Stays alive as standalone content generator. Generate prompt ported. |
| `shiki4709/syval-landing` | Landing page at syvalapp.com. Links to nevara-gtm after launch. |
| `shiki4709/nevara-gtm` | The unified product. Eventually renamed to `syval-app`. |
