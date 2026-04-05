"""
Francesca Chat — Turso Database Client
Shared database helper using libsql_client (HTTP transport, no native deps).
Uses the same Turso instance as global-ai-sentinel-hq.
"""

import os

_client = None
_tables_ready = False


def get_db():
    """Return a cached Turso libsql sync client (lazy init)."""
    global _client

    if _client is not None:
        return _client

    db_url = os.environ.get("TURSO_DATABASE_URL", "")
    auth_token = os.environ.get("TURSO_AUTH_TOKEN", "")

    if not db_url or not auth_token:
        return None

    import libsql_client
    # Convert libsql:// to https:// for HTTP transport
    http_url = (
        db_url
        .replace("libsql://", "https://")
        .replace("ws://", "http://")
        .replace("wss://", "https://")
    )
    _client = libsql_client.create_client_sync(url=http_url, auth_token=auth_token)
    _ensure_tables(_client)
    return _client


def _ensure_tables(client):
    """Create chat tables if they don't exist."""
    global _tables_ready
    if _tables_ready:
        return
    client.batch([
        """CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            visitor_name TEXT DEFAULT 'Visitor',
            visitor_page TEXT DEFAULT '',
            status TEXT DEFAULT 'bot',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            unread_count INTEGER DEFAULT 0
        )""",
        """CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        )""",
        "CREATE INDEX IF NOT EXISTS idx_sessions_updated ON chat_sessions(updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_status ON chat_sessions(status)",
        "CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, created_at)",
        """CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            path TEXT NOT NULL DEFAULT '/',
            referrer TEXT DEFAULT '',
            user_agent TEXT DEFAULT '',
            visitor_id TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        )""",
        "CREATE INDEX IF NOT EXISTS idx_pageviews_created ON page_views(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_pageviews_path ON page_views(path, created_at)",
    ])
    _tables_ready = True


def execute(sql, args=None):
    """Execute SQL and return result set."""
    db = get_db()
    if not db:
        return None
    if args:
        return db.execute(sql, args)
    return db.execute(sql)


def rows_to_dicts(result_set):
    """Convert a libsql ResultSet into a list of dicts."""
    if not result_set or not result_set.columns:
        return []
    return [dict(zip(result_set.columns, row)) for row in result_set.rows]
