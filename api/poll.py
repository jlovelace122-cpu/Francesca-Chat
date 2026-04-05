"""
Francesca Chat — Widget Polling API
Widget polls this endpoint for new operator messages.
"""

import os
from flask import Flask, request, jsonify

app = Flask(__name__)

ALLOWED_ORIGINS = [
    "https://francescapmu.com",
    "https://www.francescapmu.com",
    "http://localhost:8090",
    "http://localhost:3000",
    "http://127.0.0.1:8090",
]


def _cors_headers(origin=None):
    if not origin:
        return {}
    allowed = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    }


@app.route("/api/poll", methods=["GET", "OPTIONS"])
def poll():
    """Widget polls for new operator messages since a given timestamp."""
    origin = request.headers.get("Origin", "")
    cors = _cors_headers(origin)

    if request.method == "OPTIONS":
        return ("", 204, cors)

    session_id = request.args.get("session_id", "").strip()
    after = request.args.get("after", "").strip()

    if not session_id:
        resp = jsonify({"status": "ok", "messages": []})
        resp.headers.update(cors)
        return resp

    try:
        from api._supabase import get_supabase
        sb = get_supabase()
        if not sb:
            resp = jsonify({"status": "ok", "messages": []})
            resp.headers.update(cors)
            return resp

        query = (
            sb.table("chat_messages")
            .select("content, sender, created_at")
            .eq("session_id", session_id)
            .eq("sender", "operator")
            .order("created_at", desc=False)
        )

        if after:
            query = query.gt("created_at", after)

        result = query.execute()

        # Also get session status
        session = (
            sb.table("chat_sessions")
            .select("status")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        status = session.data[0]["status"] if session.data else "bot"

        resp = jsonify({
            "status": "ok",
            "messages": result.data,
            "session_status": status,
        })
        resp.headers.update(cors)
        return resp

    except Exception:
        resp = jsonify({"status": "ok", "messages": []})
        resp.headers.update(cors)
        return resp
