"""
Francesca Chat — Admin Sessions API
Lists chat sessions for the admin dashboard.
"""

import os
from flask import Flask, request, jsonify

app = Flask(__name__)

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")


def _check_auth():
    """Verify admin token from Authorization header or query param."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        token = request.args.get("token", "")
    if not ADMIN_TOKEN or token != ADMIN_TOKEN:
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
        from api._supabase import get_supabase
        sb = get_supabase()
        if not sb:
            resp = jsonify({"status": "error", "error": "Database not configured"})
            resp.headers.update(cors)
            return resp, 503

        status_filter = request.args.get("status", "")

        query = sb.table("chat_sessions").select("*").order("updated_at", desc=True).limit(100)

        if status_filter:
            query = query.eq("status", status_filter)

        result = query.execute()

        # Get last message preview for each session
        sessions_data = []
        for s in result.data:
            last_msg = (
                sb.table("chat_messages")
                .select("content, sender, created_at")
                .eq("session_id", s["id"])
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            s["last_message"] = last_msg.data[0] if last_msg.data else None
            # Count total messages
            msg_count = (
                sb.table("chat_messages")
                .select("id", count="exact")
                .eq("session_id", s["id"])
                .execute()
            )
            s["message_count"] = msg_count.count or 0
            sessions_data.append(s)

        resp = jsonify({"status": "ok", "sessions": sessions_data})
        resp.headers.update(cors)
        return resp

    except Exception as e:
        resp = jsonify({"status": "error", "error": str(e)})
        resp.headers.update(cors)
        return resp, 500
