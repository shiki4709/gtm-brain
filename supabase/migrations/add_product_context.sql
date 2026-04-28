-- Add product_context column to sb_users
-- Stores what the user sells, who it's for, pain points, differentiator, CTA
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS product_context JSONB DEFAULT NULL;
