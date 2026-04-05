"""
Francesca Chat — Admin Sessions API
Lists chat sessions for the admin dashboard.
Powered by Turso (libsql).
"""

import os
from flask import Flask, request, jsonify

app = Flask(__name__)

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")


def _check_auth():
    """Verify admin token from Authorization header or query param."""
    # Re-read env var each time (Vercel can set it after module load)
    admin_token = os.environ.get("ADMIN_TOKEN", "")
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        token = request.args.get("token", "")
    if not admin_token or token != admin_token:
        return False
    return True


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
    }


@app.route("/api/sessions", methods=["GET", "OPTIONS"])
def sessions():
    cors = _cors_headers()

    if request.method == "OPTIONS":
        return ("", 204, cors)

    if not _check_auth():
        resp = jsonify({"status": "error", "error": "Unauthorized"})
        resp.headers.update(cors)
        return resp, 401

    try:
        from api._db import execute, rows_to_dicts

        status_filter = request.args.get("status", "")

        if status_filter:
            rows = execute(
                "SELECT * FROM chat_sessions WHERE status = ? ORDER BY updated_at DESC LIMIT 100",
                [status_filter],
            )
        else:
            rows = execute(
                "SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT 100"
            )

        sessions_data = rows_to_dicts(rows)

        # Get last message preview + count for each session
        for s in sessions_data:
            last_msg = execute(
                "SELECT content, sender, created_at FROM chat_messages "
                "WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
                [s["id"]],
            )
            last_list = rows_to_dicts(last_msg)
            s["last_message"] = last_list[0] if last_list else None

            count_rs = execute(
                "SELECT COUNT(*) AS cnt FROM chat_messages WHERE session_id = ?",
                [s["id"]],
            )
            count_list = rows_to_dicts(count_rs)
            s["message_count"] = count_list[0]["cnt"] if count_list else 0

        resp = jsonify({"status": "ok", "sessions": sessions_data})
        resp.headers.update(cors)
        return resp

    except Exception as e:
        resp = jsonify({"status": "error", "error": str(e)})
        resp.headers.update(cors)
        return resp, 500
