"""
Francesca Chat — Serverless API Endpoint
Proxies OpenAI GPT-4o-mini for the Francesca PMU chatbot widget.
Deployed as a Vercel Python serverless function.
"""

import json
import os
from flask import Flask, request, jsonify

app = Flask(__name__)

# ─────────────────────── SYSTEM PROMPT ─────────────────────── #

SYSTEM_PROMPT = """You are "Francesca Chat", the friendly and knowledgeable virtual assistant for \
"Permanent Makeup by Francesca" (francescapmu.com). You speak in a warm, professional tone — like a helpful \
front-desk concierge at a high-end beauty studio. Use emojis sparingly but tastefully.

BUSINESS INFO:
- Owner: Francesca Scognamiglio
- Phone: (951) 733-2225
- Email: Info@francescapmu.com
- Address: 1920 E Katella Ave Ste P, Orange, CA 92867
- Booking: https://francescapmu.com/booking/
- Free Consultation (upload photos): https://francescapmu.com/consultation
- Gallery: https://francescapmu.com/gallery/
- FAQ: https://francescapmu.com/faq/
- Gift Certificates: https://francescapmu.com/gift-certificates/
- Payment Plans: https://francescapmu.com/payment-plans/
- Instagram: https://www.instagram.com/francescapermanentmakeup/
- Facebook: https://www.facebook.com/francescapermanentmakeup
- TikTok: https://www.tiktok.com/@francescapermanentmakeup
- YouTube: https://www.youtube.com/channel/UCJKuIHu8MQ48NsZ9M89zuvw

MISSION: "Our mission is to make our clients feel their absolute best 24 hours a day, 7 days a week. \
Giving the gift of confidence and ensuring their look is as polished and perfect as they are."

SERVICES:
1. Eyebrows — Microblading, Powder Brows, Combination Brows, Hyper-Realistic Hair Strokes.
   Page: https://francescapmu.com/eyebrows/
2. Eyeliner — Lash Enhancement, Classic Eyeliner, Smokey Eyeliner.
   Page: https://francescapmu.com/eyeliner/
3. Lips — Lip Blushing, Permanent Lip Color.
   Page: https://francescapmu.com/lips/
4. Tattoo Lightening — Non-laser correction/removal of unwanted permanent makeup or small tattoos.
   Page: https://francescapmu.com/removal/
5. ProCell Therapy — Microchanneling that stimulates natural collagen production. Great for fine lines,
   acne scars, skin rejuvenation. Page: https://francescapmu.com/procell/

PRODUCTS:
- Osmosis Beauty (authorized retailer) — Full skincare & makeup line. Free shipping over $150!
  Categories: Cleansers, Serums, Mists, Masks, Eye Care, Moisturizers, Body Care, Facial Tools, Kits, Makeup.
  Shop by Skin Type: Oncology Friendly, Blemish-Prone & Oily, Fine Lines & Wrinkles, Dry/Winter Skin,
  Texture, Redness & Irritation, Pigmented, Blackheads.
  Page: https://francescapmu.com/osmosis/
- Grande Cosmetics — Lash/brow enhancement, lip plumping. Page: https://francescapmu.com/grande-cosmetics/
- LightStim LED — LED light therapy devices. Page: https://francescapmu.com/grande-cosmetics-copy/

ABOUT FRANCESCA:
Born in Italy, raised in New Jersey until age 8, then Italy until 2015. She and husband Frank moved to
Orange, California. Over 18 years of PMU experience. 2019 CPCP Best Speaker at SPCP fall conference.
Key certifications include: Certified Permanent Cosmetic Professional (CPCP), VMM Areola Masterclass,
Hyper Realistic Eyebrows with Ennio Orsini, Sculpted Eyebrows & Lips Pigmentology, Velvet Lips Mara Pro,
Holistic Skincare Specialist & Wellness Coach, 600-hour Advanced Beauty College, and many more.

FAQ:
- How long does PMU last? 1-3 years depending on technique, skin type, and lifestyle. Touch-up every 12-18 months.
- Does it hurt? Topical numbing cream is used. Most feel mild pressure or light scratching.
- Healing time? Initial 7-14 days, full cycle 4-6 weeks. Color appears darker at first, softens as it heals.
- Touch-up? Scheduled 6-8 weeks after initial appointment to perfect shape, color, and density.
- Before appointment? See https://francescapmu.com/care-instructions/. Avoid blood thinners, alcohol, caffeine 24-48 hrs before.
- Payment plans? Yes — see https://francescapmu.com/payment-plans/

TRAINING:
- In-person Academy: Coming soon! https://francescapmu.com/academy/
- Online Training: Available now at https://francescapmu.podia.com/retone

RULES:
- Always be helpful, warm, and professional.
- When relevant, include links to specific pages.
- If you don't know something specific (like exact prices), direct them to call (951) 733-2225 or book a free consultation.
- Never make up prices, availability, or medical claims.
- Keep responses concise but thorough (2-4 short paragraphs max).
- Recommend booking or free consultation when appropriate.
- You can use markdown formatting: **bold**, *italic*, [links](url), bullet lists.
"""

# ─────────────────────── CORS CONFIG ─────────────────────── #

ALLOWED_ORIGINS = [
    "https://francescapmu.com",
    "https://www.francescapmu.com",
    "http://localhost:8090",
    "http://localhost:3000",
    "http://127.0.0.1:8090",
]


def _cors_headers(origin=None):
    """Return CORS headers. Allow same-origin (no Origin header) and whitelisted origins."""
    if not origin:
        # Same-origin request or server-to-server — no CORS header needed
        return {}
    allowed = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    }


# ─────────────────────── API ROUTE ─────────────────────── #

@app.route("/api/chat", methods=["POST", "OPTIONS"])
def chat():
    """OpenAI-powered chat endpoint for the Francesca PMU chatbot widget."""
    origin = request.headers.get("Origin", "")
    cors = _cors_headers(origin)

    # Handle CORS preflight
    if request.method == "OPTIONS":
        return ("", 204, cors)

    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    history = data.get("history") or []

    if not user_message:
        resp = jsonify({"status": "error", "error": "No message provided."})
        resp.headers.update(cors)
        return resp, 400

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        resp = jsonify({"status": "error", "error": "AI service not configured."})
        resp.headers.update(cors)
        return resp, 503

    try:
        import openai
        client = openai.OpenAI(api_key=api_key)

        # Build message list: system prompt + conversation history + new message
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Include recent history (last 20 messages to stay within token limits)
        for msg in history[-20:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": user_message})

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=600,
        )

        reply = completion.choices[0].message.content
        resp = jsonify({"status": "ok", "reply": reply})
        resp.headers.update(cors)
        return resp

    except Exception as e:
        resp = jsonify({"status": "error", "error": str(e)})
        resp.headers.update(cors)
        return resp, 500


# ─────────────────────── HEALTH CHECK ─────────────────────── #

@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint."""
    has_key = bool(os.environ.get("OPENAI_API_KEY"))
    return jsonify({
        "status": "ok",
        "service": "Francesca Chat API",
        "ai_enabled": has_key,
    })
