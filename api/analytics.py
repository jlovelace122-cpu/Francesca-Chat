"""
Francesca Chat — Analytics API
Returns aggregated site traffic + chat stats for the admin dashboard.
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
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
    }


@app.route("/api/analytics", methods=["GET", "OPTIONS"])
def analytics():
    cors = _cors_headers()

    if request.method == "OPTIONS":
        return ("", 204, cors)

    if not _check_auth():
        resp = jsonify({"status": "error", "error": "Unauthorized"})
        resp.headers.update(cors)
        return resp, 401

    # Period: default last 30 days
    days = int(request.args.get("days", "30"))
    if days < 1:
        days = 1
    if days > 365:
        days = 365

    try:
        from api._db import execute, rows_to_dicts

        # ── Page views: total ──
        r = execute(
            "SELECT COUNT(*) AS total FROM page_views "
            "WHERE created_at >= datetime('now', ?)",
            [f"-{days} days"],
        )
        total_views = rows_to_dicts(r)[0]["total"] if r else 0

        # ── Unique visitors (by visitor_id) ──
        r = execute(
            "SELECT COUNT(DISTINCT visitor_id) AS total FROM page_views "
            "WHERE created_at >= datetime('now', ?) AND visitor_id != ''",
            [f"-{days} days"],
        )
        unique_visitors = rows_to_dicts(r)[0]["total"] if r else 0

        # ── Views per day (for chart) ──
        r = execute(
            "SELECT DATE(created_at) AS day, COUNT(*) AS views FROM page_views "
            "WHERE created_at >= datetime('now', ?) "
            "GROUP BY DATE(created_at) ORDER BY day",
            [f"-{days} days"],
        )
        views_per_day = rows_to_dicts(r) if r else []

        # ── Top pages ──
        r = execute(
            "SELECT path, COUNT(*) AS views FROM page_views "
            "WHERE created_at >= datetime('now', ?) "
            "GROUP BY path ORDER BY views DESC LIMIT 10",
            [f"-{days} days"],
        )
        top_pages = rows_to_dicts(r) if r else []

        # ── Top referrers ──
        r = execute(
            "SELECT referrer, COUNT(*) AS views FROM page_views "
            "WHERE created_at >= datetime('now', ?) AND referrer != '' "
            "GROUP BY referrer ORDER BY views DESC LIMIT 10",
            [f"-{days} days"],
        )
        top_referrers = rows_to_dicts(r) if r else []

        # ── Device breakdown (from user agent) ──
        r = execute(
            "SELECT "
            "  CASE "
            "    WHEN user_agent LIKE '%Mobile%' OR user_agent LIKE '%Android%' THEN 'Mobile' "
            "    WHEN user_agent LIKE '%Tablet%' OR user_agent LIKE '%iPad%' THEN 'Tablet' "
            "    ELSE 'Desktop' "
            "  END AS device, "
            "  COUNT(*) AS views "
            "FROM page_views "
            "WHERE created_at >= datetime('now', ?) "
            "GROUP BY device ORDER BY views DESC",
            [f"-{days} days"],
        )
        devices = rows_to_dicts(r) if r else []

        # ── Chat stats ──
        r = execute(
            "SELECT COUNT(*) AS total FROM chat_sessions "
            "WHERE created_at >= datetime('now', ?)",
            [f"-{days} days"],
        )
        total_chats = rows_to_dicts(r)[0]["total"] if r else 0

        r = execute(
            "SELECT COUNT(*) AS total FROM chat_messages "
            "WHERE created_at >= datetime('now', ?)",
            [f"-{days} days"],
        )
        total_messages = rows_to_dicts(r)[0]["total"] if r else 0

        r = execute(
            "SELECT COUNT(*) AS total FROM chat_sessions "
            "WHERE status = 'live' AND created_at >= datetime('now', ?)",
            [f"-{days} days"],
        )
        live_takeovers = rows_to_dicts(r)[0]["total"] if r else 0

        # ── Chats per day (for chart) ──
        r = execute(
            "SELECT DATE(created_at) AS day, COUNT(*) AS chats FROM chat_sessions "
            "WHERE created_at >= datetime('now', ?) "
            "GROUP BY DATE(created_at) ORDER BY day",
            [f"-{days} days"],
        )
        chats_per_day = rows_to_dicts(r) if r else []

        resp = jsonify({
            "status": "ok",
            "period_days": days,
            "traffic": {
                "total_views": total_views,
                "unique_visitors": unique_visitors,
                "views_per_day": views_per_day,
                "top_pages": top_pages,
                "top_referrers": top_referrers,
                "devices": devices,
            },
            "chat": {
                "total_chats": total_chats,
                "total_messages": total_messages,
                "live_takeovers": live_takeovers,
                "chats_per_day": chats_per_day,
            },
        })
        resp.headers.update(cors)
        return resp

    except Exception as e:
        resp = jsonify({"status": "error", "error": str(e)})
        resp.headers.update(cors)
        return resp, 500
