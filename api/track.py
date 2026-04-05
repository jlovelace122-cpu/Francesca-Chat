"""
Francesca Chat — Page View Tracker
Lightweight endpoint that logs page views from the widget script.
"""

from flask import Flask, request, jsonify
from urllib.parse import urlparse

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
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    }


@app.route("/api/track", methods=["POST", "OPTIONS"])
def track():
    """Log a page view. Called once per page load by the widget."""
    origin = request.headers.get("Origin", "")
    cors = _cors_headers(origin)

    if request.method == "OPTIONS":
        return ("", 204, cors)

    try:
        data = request.get_json(silent=True) or {}
        url = (data.get("url") or "").strip()
        referrer = (data.get("referrer") or "").strip()
        visitor_id = (data.get("visitor_id") or "").strip()
        user_agent = request.headers.get("User-Agent", "")[:500]

        if not url:
            resp = jsonify({"status": "ok"})
            resp.headers.update(cors)
            return resp

        # Extract path from URL
        parsed = urlparse(url)
        path = parsed.path or "/"

        from api._db import execute
        execute(
            "INSERT INTO page_views (url, path, referrer, user_agent, visitor_id) "
            "VALUES (?, ?, ?, ?, ?)",
            [url[:2000], path[:500], referrer[:2000], user_agent, visitor_id[:100]],
        )

        resp = jsonify({"status": "ok"})
        resp.headers.update(cors)
        return resp

    except Exception:
        resp = jsonify({"status": "ok"})
        resp.headers.update(cors)
        return resp
