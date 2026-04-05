"""
Francesca Chat — Operator Reply API
Allows Francesca to send messages to active chat sessions.
"""

import os
from flask import Flask, request, jsonify

app = Flask(__name__)

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")


def _check_auth():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        token = request.args.get("token", "")
    if not ADMIN_TOKEN or token != ADMIN_TOKEN:
        return False
    return True


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
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
        from api._supabase import get_supabase
        sb = get_supabase()
        if not sb:
            resp = jsonify({"status": "error", "error": "Database not configured"})
            resp.headers.update(cors)
            return resp, 503

        # Store operator message
        sb.table("chat_messages").insert({
            "session_id": session_id,
            "sender": "operator",
            "content": message,
        }).execute()

        # Update session status to 'live' and reset unread
        sb.table("chat_sessions").update({
            "status": "live",
            "unread_count": 0,
        }).eq("id", session_id).execute()

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
        from api._supabase import get_supabase
        sb = get_supabase()
        if not sb:
            resp = jsonify({"status": "error", "error": "Database not configured"})
            resp.headers.update(cors)
            return resp, 503

        result = (
            sb.table("chat_messages")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .execute()
        )

        # Mark session as read
        sb.table("chat_sessions").update({"unread_count": 0}).eq("id", session_id).execute()

        resp = jsonify({"status": "ok", "messages": result.data})
        resp.headers.update(cors)
        return resp

    except Exception as e:
        resp = jsonify({"status": "error", "error": str(e)})
        resp.headers.update(cors)
        return resp, 500
