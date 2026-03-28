-- GTM Brain Schema
-- Run this in Supabase SQL Editor to create all tables

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

-- Content classification tags (per-platform brain)
CREATE TABLE sb_content_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  platform TEXT NOT NULL,
  -- platform: 'linkedin' | 'x'
  content_type TEXT NOT NULL,
  -- content_type: 'dm' | 'reply' | 'post'
  reference_id UUID,
  -- references lead_id, x_engage_id, or post_id depending on content_type
  tags JSONB NOT NULL DEFAULT '{}',
  -- linkedin dm: { dm_tone, dm_length, dm_personalization }
  -- x reply: { reply_style, reply_length }
  -- post: { content_format }
  engagement JSONB DEFAULT '{}',
  -- { likes: 0, replies: 0, followers_gained: 0 }
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_scrapes_user ON sb_scrapes(user_id);
CREATE INDEX idx_leads_user ON sb_leads(user_id);
CREATE INDEX idx_leads_scrape ON sb_leads(scrape_id);
CREATE INDEX idx_leads_status ON sb_leads(status);
CREATE INDEX idx_leads_icp ON sb_leads(icp_match);
CREATE INDEX idx_replies_lead ON sb_replies(lead_id);
CREATE INDEX idx_posts_user ON sb_posts(user_id);
CREATE INDEX idx_x_engage_user ON sb_x_engage(user_id);
CREATE INDEX idx_insights_user ON sb_insights(user_id);
CREATE INDEX idx_insights_type ON sb_insights(insight_type);
CREATE INDEX idx_content_tags_user ON sb_content_tags(user_id);
CREATE INDEX idx_content_tags_platform ON sb_content_tags(platform);
