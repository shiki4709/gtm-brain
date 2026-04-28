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
  voice_profile JSONB DEFAULT NULL,
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
  -- types: topic_performance, icp_pattern, dm_effectiveness, timing, weekly_summary, pipeline_run, outcome
  insight_data JSONB NOT NULL,
  confidence FLOAT DEFAULT 0.5,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- Watch list
CREATE TABLE sb_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  platform TEXT NOT NULL,
  -- platform: 'linkedin' | 'x'
  username TEXT NOT NULL,
  display_name TEXT,
  headline TEXT,
  profile_url TEXT,
  last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform, username)
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

-- Brain decision log (tracks recommendations + outcomes)
CREATE TABLE sb_brain_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  platform TEXT NOT NULL,
  -- platform: 'linkedin' | 'x'
  source_url TEXT NOT NULL,
  author_handle TEXT,
  recommended_action TEXT NOT NULL,
  -- recommended_action: 'scrape' | 'reply' | 'content' | 'skip'
  priority TEXT NOT NULL,
  -- priority: 'high' | 'medium' | 'low'
  reason TEXT,
  engagement_at_time JSONB DEFAULT '{}',
  -- { likes, comments, shares, age_hours, velocity }
  user_action TEXT,
  -- user_action: 'followed' | 'skipped' | 'different' (null = pending)
  outcome JSONB DEFAULT '{}',
  -- linkedin scrape: { icp_leads, total_engagers, reply_rate }
  -- x reply: { likes_gained, replies_gained }
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Product context (what user sells, for narrative alignment)
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS product_context JSONB DEFAULT NULL;

-- User mode (personal brand / B2B outbound / both)
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'personal_brand'
  CHECK (mode IN ('personal_brand', 'b2b_outbound', 'both'));
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS mode_set BOOLEAN DEFAULT false;
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS x_handle TEXT;
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

-- User goals per mode
CREATE TABLE user_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  mode TEXT NOT NULL CHECK (mode IN ('personal_brand', 'b2b_outbound')),
  metric TEXT NOT NULL, -- must match action_log.action_type: 'reply', 'dm_send', 'scrape'
  target_value INTEGER NOT NULL,
  period TEXT NOT NULL DEFAULT 'weekly',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Action log (replies sent, DMs drafted, scrapes initiated)
CREATE TABLE action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  action_type TEXT NOT NULL, -- 'reply', 'reply_copy', 'dm_draft', 'dm_send', 'scrape', 'dm_reply_received'
  post_id TEXT,
  platform TEXT, -- 'x', 'linkedin'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily metrics snapshots (follower counts, engagement rates)
CREATE TABLE metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  metric TEXT NOT NULL, -- 'x_followers', 'linkedin_connections', 'dm_reply_rate'
  value NUMERIC NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, metric, snapshot_date)
);

-- Notifications (pushed to Telegram/Slack)
CREATE TABLE sb_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sb_users(id),
  channel TEXT NOT NULL, -- 'telegram' | 'slack'
  post_url TEXT NOT NULL,
  action_type TEXT NOT NULL, -- 'reply' | 'scrape' | 'repurpose'
  draft_text TEXT,
  score NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pushed', -- 'pushed' | 'acted' | 'skipped'
  pushed_at TIMESTAMPTZ DEFAULT now(),
  acted_at TIMESTAMPTZ
);

-- User notification preferences
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS notification_channels JSONB DEFAULT '[]';
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Los_Angeles';

-- Indexes for feedback loop tables
CREATE INDEX idx_user_goals_user ON user_goals(user_id);
CREATE INDEX idx_action_log_user ON action_log(user_id);
CREATE INDEX idx_action_log_type ON action_log(action_type);
CREATE INDEX idx_action_log_created ON action_log(created_at);
CREATE INDEX idx_metrics_snapshots_user ON metrics_snapshots(user_id);

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
CREATE INDEX idx_watchlist_user ON sb_watchlist(user_id);
CREATE INDEX idx_brain_log_user ON sb_brain_log(user_id);
CREATE INDEX idx_brain_log_action ON sb_brain_log(recommended_action);
CREATE INDEX idx_notifications_user ON sb_notifications(user_id);
CREATE INDEX idx_notifications_pushed ON sb_notifications(pushed_at);
CREATE INDEX idx_notifications_status ON sb_notifications(status);
