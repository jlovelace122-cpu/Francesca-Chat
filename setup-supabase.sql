-- ============================================================
-- Francesca Chat — Supabase Database Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Chat Sessions
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  visitor_name TEXT DEFAULT 'Visitor',
  visitor_page TEXT,
  status TEXT DEFAULT 'bot' CHECK (status IN ('bot', 'live', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  unread_count INTEGER DEFAULT 0
);

-- 2. Chat Messages
CREATE TABLE chat_messages (
  id SERIAL PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('visitor', 'bot', 'operator')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes for fast queries
CREATE INDEX idx_sessions_updated ON chat_sessions(updated_at DESC);
CREATE INDEX idx_sessions_status ON chat_sessions(status);
CREATE INDEX idx_messages_session ON chat_messages(session_id, created_at);

-- 4. Auto-update updated_at on sessions when new messages arrive
CREATE OR REPLACE FUNCTION update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions
  SET updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_session_timestamp
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_session_timestamp();

-- 5. Helper RPC: increment unread count
CREATE OR REPLACE FUNCTION increment_unread(sid TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE chat_sessions SET unread_count = unread_count + 1 WHERE id = sid;
END;
$$ LANGUAGE plpgsql;

-- 6. Enable Realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE chat_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- 6. Row Level Security (allow service_role full access)
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to sessions"
  ON chat_sessions FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to messages"
  ON chat_messages FOR ALL
  USING (true) WITH CHECK (true);
