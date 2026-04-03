# Francesca Chat 💄

AI-powered chatbot for **[Permanent Makeup by Francesca](https://francescapmu.com)** — deployed on Vercel.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  WordPress (francescapmu.com)                    │
│  └─ <script src="https://your.vercel.app/       │
│       francesca-chat.js"></script>               │
└────────────────────┬────────────────────────────┘
                     │ POST /api/chat
                     ▼
┌─────────────────────────────────────────────────┐
│  Vercel Project (this repo)                      │
│  ├─ public/francesca-chat.js  → static widget   │
│  ├─ public/index.html         → demo page       │
│  └─ api/chat.py               → OpenAI proxy    │
│       └─ GPT-4o-mini + system prompt             │
└─────────────────────────────────────────────────┘
```

**API key stays server-side** — never exposed to the client.

## Quick Deploy

### 1. Push to GitHub

```bash
cd francesca-chat
git init
git add -A
git commit -m "Initial commit — Francesca Chat"
gh repo create francesca-chat --public --push --source .
```

### 2. Connect to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `francesca-chat` GitHub repo
3. Framework Preset: **Other**
4. Click **Deploy**

### 3. Set Environment Variable

In the Vercel dashboard → **Settings → Environment Variables**:

| Key              | Value                        |
| ---------------- | ---------------------------- |
| `OPENAI_API_KEY` | `sk-your-openai-api-key`     |

Or via CLI:
```bash
vercel env add OPENAI_API_KEY
```

Then redeploy:
```bash
vercel --prod
```

### 4. Verify

Visit `https://your-project.vercel.app` — you should see the demo page with a working chat bubble.

Test the API:
```bash
curl -X POST https://your-project.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What services do you offer?"}'
```

## Install on WordPress

Since francescapmu.com runs WordPress with Beaver Builder, here are your options:

### Option A: WPCode Plugin (Easiest)

1. Log into `francescapmu.com/wp-admin`
2. **Plugins → Add New** → search **"WPCode"** → install & activate
3. Go to **Code Snippets → Header & Footer**
4. In the **Footer** box, paste:
   ```html
   <!-- Francesca Chat -->
   <script src="https://your-project.vercel.app/francesca-chat.js"></script>
   ```
5. Save → done! 🎉

### Option B: Beaver Builder

1. Edit any page → **Beaver Builder**
2. Add an **HTML module** to a global footer row
3. Paste the same `<script>` tag
4. Save & publish

### Option C: Theme Functions (wp_enqueue_script)

In `bb-theme-child/functions.php`:

```php
function francesca_chat_widget() {
    wp_enqueue_script(
        'francesca-chat',
        'https://your-project.vercel.app/francesca-chat.js',
        array(),
        '1.0.0',
        true
    );
}
add_action('wp_enqueue_scripts', 'francesca_chat_widget');
```

> **Important:** Replace `your-project.vercel.app` with your actual Vercel deployment URL.

### Cross-Domain Note

When the widget JS is loaded from WordPress (different domain than the API), it needs CORS.
The API already allows `francescapmu.com` and `www.francescapmu.com`.

If your Vercel URL is different from `francesca-chat.vercel.app`, update `ALLOWED_ORIGINS`
in [api/chat.py](api/chat.py) and the `API_URL` in
[public/francesca-chat.js](public/francesca-chat.js).

## Project Structure

```
francesca-chat/
├── api/
│   └── chat.py              # Serverless OpenAI proxy (Flask)
├── public/
│   ├── francesca-chat.js    # Chatbot widget (vanilla JS, self-contained)
│   └── index.html           # Demo / landing page
├── vercel.json              # Vercel routing config
├── requirements.txt         # Python dependencies (flask, openai)
├── .env.example             # Template for local dev
├── .gitignore
└── README.md
```

## Local Development

```bash
# Clone
git clone https://github.com/your-org/francesca-chat.git
cd francesca-chat

# Create .env
cp .env.example .env
# Edit .env and add your OpenAI API key

# Install deps
pip install -r requirements.txt

# Run API locally
cd api && FLASK_APP=chat.py flask run --port 5001

# Serve static files (separate terminal)
cd public && python -m http.server 8090
```

Or use the Vercel CLI:
```bash
npm i -g vercel
vercel dev
```

## Features

- 🤖 **AI-Powered** — GPT-4o-mini with comprehensive business knowledge
- 🔄 **Automatic Fallback** — Built-in keyword matcher if API is unavailable
- 🧠 **Conversation Memory** — Maintains context across the chat session
- 💄 **Full Knowledge Base** — Services, products, FAQ, policies, training, testimonials
- 🎨 **Branded Design** — Matches francescapmu.com gold/brown palette
- 📱 **Fully Responsive** — Desktop, tablet, mobile (full-screen on small screens)
- ⚡ **Zero Dependencies** — Single vanilla JS file, no npm/webpack/React
- 🔒 **Secure** — API key stays on server; widget never sees it
- 💬 **Quick Reply Buttons** — Context-aware suggestions after each response
- ✨ **Typing Animation** — Natural feel with bounce indicator

## API Reference

### `POST /api/chat`

**Request:**
```json
{
  "message": "What eyebrow services do you offer?",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello! Welcome..." }
  ]
}
```

**Response (success):**
```json
{
  "status": "ok",
  "reply": "We offer several eyebrow techniques..."
}
```

**Response (error):**
```json
{
  "status": "error",
  "error": "Error description"
}
```

### `GET /api/health`

Returns API status and whether OpenAI is configured.

---

Built by [Global AI Sentinel](https://globalaisentinel.com) 🛡️
