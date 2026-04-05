"""
Shared Supabase client helper for Francesca Chat API functions.
"""

import os

_client = None


def get_supabase():
    """Return a cached Supabase client (lazy init)."""
    global _client
    if _client is not None:
        return _client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    if not url or not key:
        return None

    from supabase import create_client
    _client = create_client(url, key)
    return _client
