"""
Francesca Chat — Operator Reply API
Allows Francesca to send messages to active chat sessions.
Powered by Turso (libsql).
"""

import os
from flask import Flask, request, jsonify

app = Flask(__name__)

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")


def _check_auth():
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
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
    }


@app.route("/api/reply", methods=["POST", "OPTIONS"])
def reply():
    cors = _cors_headers()

    if request.method == "OPTIONS":
        return ("", 204, cors)

    if not _check_auth():
        resp = jsonify({"status": "error", "error": "Unauthorized"})
        resp.headers.update(cors)
        return resp, 401

    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    message = (data.get("message") or "").strip()

    if not session_id or not message:
        resp = jsonify({"status": "error", "error": "session_id and message required"})
        resp.headers.update(cors)
        return resp, 400

    try:
        from api._db import execute

        # Store operator message
        execute(
            "INSERT INTO chat_messages (session_id, sender, content) VALUES (?, 'operator', ?)",
            [session_id, message],
        )

        # Update session status to 'live' and reset unread
        execute(
            "UPDATE chat_sessions SET status = 'live', unread_count = 0, updated_at = datetime('now') WHERE id = ?",
            [session_id],
        )

        resp = jsonify({"status": "ok"})
        resp.headers.update(cors)
        return resp

    except Exception as e:
        resp = jsonify({"status": "error", "error": str(e)})
        resp.headers.update(cors)
        return resp, 500


@app.route("/api/messages", methods=["GET", "OPTIONS"])
def messages():
    """Get all messages for a session (used by admin dashboard)."""
    cors = _cors_headers()

    if request.method == "OPTIONS":
        return ("", 204, cors)

    if not _check_auth():
        resp = jsonify({"status": "error", "error": "Unauthorized"})
        resp.headers.update(cors)
        return resp, 401

    session_id = request.args.get("session_id", "").strip()
    if not session_id:
        resp = jsonify({"status": "error", "error": "session_id required"})
        resp.headers.update(cors)
        return resp, 400

    try:
        from api._db import execute, rows_to_dicts

        rows = execute(
            "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
            [session_id],
        )
        msgs = rows_to_dicts(rows)

        # Mark session as read
        execute(
            "UPDATE chat_sessions SET unread_count = 0 WHERE id = ?",
            [session_id],
        )

        resp = jsonify({"status": "ok", "messages": msgs})
        resp.headers.update(cors)
        return resp

    except Exception as e:
        resp = jsonify({"status": "error", "error": str(e)})
        resp.headers.update(cors)
        return resp, 500
