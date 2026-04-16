-- Content sources: universal feed ingestion from any platform
-- Supports: Substack (RSS), LinkedIn, X, blogs, newsletters

CREATE TABLE sb_content_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  platform TEXT NOT NULL,
  -- platform: 'substack' | 'linkedin' | 'x' | 'blog' | 'medium' | 'ghost'
  source_type TEXT NOT NULL DEFAULT 'rss',
  -- source_type: 'rss' | 'profile' | 'manual'
  name TEXT NOT NULL,
  -- display name, e.g. "Almost Technical" or "@harukatakamori"
  feed_url TEXT,
  -- RSS/Atom feed URL (null for manual sources)
  profile_url TEXT,
  -- link to the source profile/page
  is_own_content BOOLEAN DEFAULT true,
  -- true = user's own content (extract takes + repurpose)
  -- false = someone else's content (repurpose only)
  auto_repurpose BOOLEAN DEFAULT false,
  -- automatically repurpose new content when ingested
  target_platforms JSONB DEFAULT '["linkedin", "x"]',
  -- platforms to repurpose TO when auto_repurpose is true
  last_ingested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ingested content items from sources
CREATE TABLE sb_content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sb_content_sources(id) ON DELETE CASCADE,
  user_id UUID REFERENCES sb_users(id),
  title TEXT,
  content TEXT NOT NULL,
  url TEXT,
  platform TEXT NOT NULL,
  -- platform: matches parent source platform
  published_at TIMESTAMPTZ,
  takes_extracted BOOLEAN DEFAULT false,
  repurposed BOOLEAN DEFAULT false,
  repurposed_content JSONB DEFAULT '{}',
  -- { linkedin: "...", x: "...", quote: "..." }
  ingested_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_content_sources_user ON sb_content_sources(user_id);
CREATE INDEX idx_content_items_source ON sb_content_items(source_id);
CREATE INDEX idx_content_items_user ON sb_content_items(user_id);
CREATE INDEX idx_content_items_ingested ON sb_content_items(ingested_at);
CREATE UNIQUE INDEX idx_content_items_url ON sb_content_items(user_id, url) WHERE url IS NOT NULL;
