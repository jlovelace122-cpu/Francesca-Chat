"""
Francesca Chat — Widget Polling API
Widget polls this endpoint for new operator messages.
Powered by Turso (libsql).
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
        from api._db import execute, rows_to_dicts

        if after:
            rows = execute(
                "SELECT content, sender, created_at FROM chat_messages "
                "WHERE session_id = ? AND sender = 'operator' AND created_at > ? "
                "ORDER BY created_at ASC",
                [session_id, after],
            )
        else:
            rows = execute(
                "SELECT content, sender, created_at FROM chat_messages "
                "WHERE session_id = ? AND sender = 'operator' "
                "ORDER BY created_at ASC",
                [session_id],
            )

        msgs = rows_to_dicts(rows)

        # Also get session status
        status_rs = execute(
            "SELECT status FROM chat_sessions WHERE id = ? LIMIT 1",
            [session_id],
        )
        status_list = rows_to_dicts(status_rs)
        status = status_list[0]["status"] if status_list else "bot"

        resp = jsonify({
            "status": "ok",
            "messages": msgs,
            "session_status": status,
        })
        resp.headers.update(cors)
        return resp

    except Exception:
        resp = jsonify({"status": "ok", "messages": []})
        resp.headers.update(cors)
        return resp
