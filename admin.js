/**
 * Francesca Chat — Admin Dashboard JavaScript
 * Real-time chat monitoring & operator takeover.
 */

(function () {
  "use strict";

  const API_BASE = "";  // Same-origin on Vercel
  let TOKEN = "";
  let currentSessionId = null;
  let currentFilter = "";
  let pollInterval = null;
  let sessionPollInterval = null;

  /* ─────────────────────── AUTH ─────────────────────── */

  function doLogin() {
    const input = document.getElementById("login-token");
    const token = input.value.trim();
    if (!token) return;

    TOKEN = token;
    // Test token by fetching sessions
    fetchSessions().then((ok) => {
      if (ok) {
        localStorage.setItem("fc_admin_token", token);
        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");
        startPolling();
      } else {
        document.getElementById("login-error").textContent = "Invalid password. Try again.";
        TOKEN = "";
      }
    });
  }

  function doLogout() {
    TOKEN = "";
    localStorage.removeItem("fc_admin_token");
    stopPolling();
    document.getElementById("dashboard").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("login-token").value = "";
    document.getElementById("login-error").textContent = "";
  }

  // Auto-login from saved token
  function tryAutoLogin() {
    const saved = localStorage.getItem("fc_admin_token");
    if (saved) {
      TOKEN = saved;
      fetchSessions().then((ok) => {
        if (ok) {
          document.getElementById("login-screen").classList.add("hidden");
          document.getElementById("dashboard").classList.remove("hidden");
          startPolling();
        } else {
          localStorage.removeItem("fc_admin_token");
          TOKEN = "";
        }
      });
    }
  }

  /* ─────────────────────── TABS ─────────────────────── */

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add("active");
    document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.add("hidden"));
    document.getElementById(`tab-${tab}`).classList.remove("hidden");
  }

  /* ─────────────────────── FILTERS ─────────────────────── */

  function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll(".filter").forEach((f) => f.classList.remove("active"));
    document.querySelector(`.filter[data-filter="${filter}"]`).classList.add("active");
    fetchSessions();
  }

  /* ─────────────────────── API CALLS ─────────────────────── */

  async function apiFetch(path, options = {}) {
    const headers = { Authorization: `Bearer ${TOKEN}`, ...options.headers };
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (res.status === 401) {
      doLogout();
      return null;
    }
    return res.json();
  }

  async function fetchSessions() {
    try {
      const params = currentFilter ? `?status=${currentFilter}` : "";
      const data = await apiFetch(`/api/sessions${params}`);
      if (!data || data.status !== "ok") return false;
      renderSessions(data.sessions);
      updateStats(data.sessions);
      return true;
    } catch {
      return false;
    }
  }

  async function fetchMessages(sessionId) {
    try {
      const data = await apiFetch(`/api/messages?session_id=${sessionId}`);
      if (data && data.status === "ok") {
        renderMessages(data.messages);
      }
    } catch { /* ignore */ }
  }

  async function sendReply() {
    const input = document.getElementById("reply-input");
    const message = input.value.trim();
    if (!message || !currentSessionId) return;

    input.value = "";
    input.disabled = true;

    try {
      await apiFetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: currentSessionId, message }),
      });

      // Refresh messages immediately
      await fetchMessages(currentSessionId);
      await fetchSessions();
    } catch { /* ignore */ }

    input.disabled = false;
    input.focus();
  }

  async function closeSession() {
    if (!currentSessionId) return;
    try {
      // Use reply endpoint to update status
      await apiFetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: currentSessionId,
          message: "This chat has been closed. Feel free to start a new conversation anytime! 💛",
        }),
      });
      await fetchSessions();
      await fetchMessages(currentSessionId);
    } catch { /* ignore */ }
  }

  /* ─────────────────────── RENDERING ─────────────────────── */

  function renderSessions(sessions) {
    const container = document.getElementById("session-items");

    if (!sessions || sessions.length === 0) {
      container.innerHTML = '<div class="empty-state">No conversations yet</div>';
      return;
    }

    container.innerHTML = sessions
      .map((s) => {
        const isActive = s.id === currentSessionId;
        const badgeClass = s.status === "live" ? "badge-live" : s.status === "closed" ? "badge-closed" : "badge-bot";
        const statusIcon = s.status === "live" ? "🟢" : s.status === "closed" ? "⚫" : "🤖";
        const preview = s.last_message ? truncate(s.last_message.content, 60) : "No messages";
        const timeStr = s.updated_at ? timeAgo(s.updated_at) : "";
        const unread = s.unread_count > 0 ? '<div class="unread-dot"></div>' : "";

        return `
          <div class="session-item ${isActive ? "active" : ""}" onclick="selectSession('${s.id}', '${escHtml(s.visitor_name || "Visitor")}', '${escHtml(s.visitor_page || "")}', '${s.status}')">
            ${unread}
            <div class="session-item-header">
              <span class="session-item-name">${statusIcon} ${escHtml(s.visitor_name || "Visitor")}</span>
              <span class="session-item-time">${timeStr}</span>
            </div>
            <div class="session-item-preview">${escHtml(preview)}</div>
            <span class="session-badge ${badgeClass}">${s.status} · ${s.message_count || 0} msgs</span>
          </div>`;
      })
      .join("");
  }

  function renderMessages(messages) {
    const container = document.getElementById("chat-messages");

    if (!messages || messages.length === 0) {
      container.innerHTML = '<div class="empty-state">No messages in this conversation</div>';
      return;
    }

    container.innerHTML = messages
      .map((m) => {
        const cls =
          m.sender === "visitor" ? "msg-visitor" :
          m.sender === "operator" ? "msg-operator" : "msg-bot";
        const label =
          m.sender === "visitor" ? "Visitor" :
          m.sender === "operator" ? "Francesca" : "AI Bot";
        const time = m.created_at ? formatTime(m.created_at) : "";

        return `
          <div class="msg ${cls}">
            <div class="msg-label">${label}</div>
            <div class="msg-content">${escHtml(m.content)}</div>
            <div class="msg-time">${time}</div>
          </div>`;
      })
      .join("");

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  function updateStats(sessions) {
    if (!sessions) return;
    const total = sessions.length;
    const active = sessions.filter((s) => s.status !== "closed").length;
    const live = sessions.filter((s) => s.status === "live").length;
    const totalMsgs = sessions.reduce((sum, s) => sum + (s.message_count || 0), 0);

    document.getElementById("stat-total").textContent = total;
    document.getElementById("stat-active").textContent = active;
    document.getElementById("stat-live").textContent = live;
    document.getElementById("stat-messages").textContent = totalMsgs;
  }

  /* ─────────────────────── SESSION SELECTION ─────────────────────── */

  function selectSession(id, name, page, status) {
    currentSessionId = id;

    document.getElementById("chat-placeholder").classList.add("hidden");
    document.getElementById("chat-active").classList.remove("hidden");
    document.getElementById("chat-visitor-name").textContent = name || "Visitor";
    document.getElementById("chat-visitor-page").textContent = page || "";

    const badge = document.getElementById("chat-session-status");
    badge.textContent = status;
    badge.className = "session-badge " + (status === "live" ? "badge-live" : status === "closed" ? "badge-closed" : "badge-bot");

    // Highlight active session
    document.querySelectorAll(".session-item").forEach((el) => el.classList.remove("active"));
    event.currentTarget?.classList.add("active");

    fetchMessages(id);

    // Focus reply input
    document.getElementById("reply-input").focus();
  }

  /* ─────────────────────── POLLING ─────────────────────── */

  function startPolling() {
    // Poll sessions every 5 seconds
    sessionPollInterval = setInterval(() => {
      fetchSessions();
      // If viewing a session, refresh its messages too
      if (currentSessionId) {
        fetchMessages(currentSessionId);
      }
    }, 5000);
  }

  function stopPolling() {
    if (sessionPollInterval) clearInterval(sessionPollInterval);
    if (pollInterval) clearInterval(pollInterval);
  }

  /* ─────────────────────── GA EMBED ─────────────────────── */

  function setGAEmbed() {
    const url = document.getElementById("ga-embed-url").value.trim();
    if (!url) return;
    localStorage.setItem("fc_ga_embed_url", url);
    loadGAEmbed(url);
  }

  function loadGAEmbed(url) {
    const container = document.getElementById("ga-embed-container");
    container.innerHTML = `<iframe src="${escHtml(url)}" allowfullscreen></iframe>`;
  }

  // Restore saved GA embed URL
  function restoreGAEmbed() {
    const saved = localStorage.getItem("fc_ga_embed_url");
    if (saved) {
      document.getElementById("ga-embed-url").value = saved;
      loadGAEmbed(saved);
    }
  }

  /* ─────────────────────── HELPERS ─────────────────────── */

  function escHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function truncate(str, len) {
    return str && str.length > len ? str.slice(0, len) + "…" : str || "";
  }

  function timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
      hour12: true,
    });
  }

  /* ─────────────────────── KEYBOARD SHORTCUTS ─────────────────────── */

  document.addEventListener("keydown", (e) => {
    // Enter to login
    if (e.key === "Enter" && document.activeElement?.id === "login-token") {
      doLogin();
    }
    // Enter to send reply
    if (e.key === "Enter" && document.activeElement?.id === "reply-input") {
      sendReply();
    }
  });

  /* ─────────────────────── INIT ─────────────────────── */

  // Expose to HTML onclick handlers
  window.doLogin = doLogin;
  window.doLogout = doLogout;
  window.switchTab = switchTab;
  window.setFilter = setFilter;
  window.selectSession = selectSession;
  window.sendReply = sendReply;
  window.closeSession = closeSession;
  window.setGAEmbed = setGAEmbed;

  // Boot
  tryAutoLogin();
  restoreGAEmbed();

})();
