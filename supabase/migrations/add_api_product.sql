-- API Product Layer: keys, credits, rate limiting
-- Run in Supabase SQL Editor

-- ═══ API KEYS ═══

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES sb_users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  permissions TEXT[] NOT NULL DEFAULT '{reply,repurpose,discover,score}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- ═══ CREDITS ═══

CREATE TABLE credits (
  user_id UUID PRIMARY KEY REFERENCES sb_users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ CREDIT TRANSACTIONS (append-only ledger) ═══

CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES sb_users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'signup_bonus')),
  api_endpoint TEXT,
  api_key_id UUID REFERENCES api_keys(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_tx_user ON credit_transactions(user_id);
CREATE INDEX idx_credit_tx_created ON credit_transactions(created_at);
CREATE INDEX idx_credit_tx_key ON credit_transactions(api_key_id);

-- ═══ RATE LIMIT TRACKING ═══

CREATE TABLE api_rate_limits (
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_type TEXT NOT NULL CHECK (window_type IN ('minute', 'day')),
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (api_key_id, window_start, window_type)
);

-- ═══ ATOMIC CREDIT DEDUCTION ═══

CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_endpoint TEXT,
  p_api_key_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT balance INTO v_balance
  FROM credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RETURN FALSE;
  END IF;

  UPDATE credits
  SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, type, api_endpoint, api_key_id)
  VALUES (p_user_id, -p_amount, 'usage', p_endpoint, p_api_key_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ═══ RATE LIMIT CHECK + INCREMENT ═══

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key_id UUID,
  p_minute_limit INTEGER DEFAULT 60,
  p_day_limit INTEGER DEFAULT 1000
) RETURNS TABLE(allowed BOOLEAN, retry_after INTEGER) AS $$
DECLARE
  v_minute_count INTEGER;
  v_day_count INTEGER;
  v_minute_start TIMESTAMPTZ;
  v_day_start TIMESTAMPTZ;
BEGIN
  v_minute_start := date_trunc('minute', now());
  v_day_start := date_trunc('day', now());

  SELECT request_count INTO v_minute_count
  FROM api_rate_limits
  WHERE api_key_id = p_key_id
    AND window_start = v_minute_start
    AND window_type = 'minute';

  IF COALESCE(v_minute_count, 0) >= p_minute_limit THEN
    RETURN QUERY SELECT FALSE, EXTRACT(EPOCH FROM (v_minute_start + interval '1 minute' - now()))::INTEGER;
    RETURN;
  END IF;

  SELECT request_count INTO v_day_count
  FROM api_rate_limits
  WHERE api_key_id = p_key_id
    AND window_start = v_day_start
    AND window_type = 'day';

  IF COALESCE(v_day_count, 0) >= p_day_limit THEN
    RETURN QUERY SELECT FALSE, EXTRACT(EPOCH FROM (v_day_start + interval '1 day' - now()))::INTEGER;
    RETURN;
  END IF;

  INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
  VALUES (p_key_id, v_minute_start, 'minute', 1)
  ON CONFLICT (api_key_id, window_start, window_type)
  DO UPDATE SET request_count = api_rate_limits.request_count + 1;

  INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
  VALUES (p_key_id, v_day_start, 'day', 1)
  ON CONFLICT (api_key_id, window_start, window_type)
  DO UPDATE SET request_count = api_rate_limits.request_count + 1;

  RETURN QUERY SELECT TRUE, 0;
END;
$$ LANGUAGE plpgsql;
