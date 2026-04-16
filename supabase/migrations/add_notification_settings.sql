-- Add notification mode, digest settings, and reply style to sb_users
ALTER TABLE sb_users
  ADD COLUMN IF NOT EXISTS notification_mode text NOT NULL DEFAULT 'realtime',
  ADD COLUMN IF NOT EXISTS digest_hour integer NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS reply_style text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS max_daily_posts integer NOT NULL DEFAULT 5;
