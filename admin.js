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

  // ── Notification state ──
  let knownSessionIds = new Set();
  let firstLoad = true;
  let alertsEnabled = true;
  let flashInterval = null;
  const ORIGINAL_TITLE = document.title;

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
    if (tab === "analytics") loadAnalytics();
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
      detectNewChats(data.sessions);
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
    const live = sessions.filter((s) => s.status === "live").length;
    const totalMsgs = sessions.reduce((sum, s) => sum + (s.message_count || 0), 0);

    const el = (id) => document.getElementById(id);
    if (el("stat-total")) el("stat-total").textContent = total;
    if (el("stat-live")) el("stat-live").textContent = live;
    if (el("stat-messages")) el("stat-messages").textContent = totalMsgs;
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

  /* ─────────────────────── ANALYTICS DASHBOARD ─────────────────────── */

  let analyticsPeriod = 30;
  let trafficChart = null;
  let chatsChart = null;
  let devicesChart = null;

  function setPeriod(days) {
    analyticsPeriod = days;
    document.querySelectorAll(".period-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector(`.period-btn[data-days="${days}"]`).classList.add("active");
    loadAnalytics();
  }

  async function loadAnalytics() {
    try {
      const data = await apiFetch(`/api/analytics?days=${analyticsPeriod}`);
      if (!data || data.status !== "ok") return;
      renderAnalytics(data);
    } catch (_e) { /* silent */ }
  }

  function renderAnalytics(data) {
    const t = data.traffic;
    const c = data.chat;

    // Stat cards
    document.getElementById("stat-views").textContent = t.total_views.toLocaleString();
    document.getElementById("stat-visitors").textContent = t.unique_visitors.toLocaleString();
    document.getElementById("stat-total").textContent = c.total_chats.toLocaleString();
    document.getElementById("stat-messages").textContent = c.total_messages.toLocaleString();
    document.getElementById("stat-live").textContent = c.live_takeovers.toLocaleString();

    // Traffic chart
    const chartOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#aaa", maxTicksLimit: 10 }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#aaa" }, grid: { color: "rgba(255,255,255,0.05)" }, beginAtZero: true },
      },
    };

    if (trafficChart) trafficChart.destroy();
    trafficChart = new Chart(document.getElementById("chart-traffic"), {
      type: "line",
      data: {
        labels: t.views_per_day.map((d) => d.day.slice(5)),
        datasets: [{
          label: "Page Views",
          data: t.views_per_day.map((d) => d.views),
          borderColor: "#d4a574",
          backgroundColor: "rgba(212,165,116,0.15)",
          fill: true,
          tension: 0.3,
        }],
      },
      options: chartOpts,
    });

    // Chats chart
    if (chatsChart) chatsChart.destroy();
    chatsChart = new Chart(document.getElementById("chart-chats"), {
      type: "bar",
      data: {
        labels: c.chats_per_day.map((d) => d.day.slice(5)),
        datasets: [{
          label: "Chats",
          data: c.chats_per_day.map((d) => d.chats),
          backgroundColor: "rgba(212,165,116,0.6)",
          borderRadius: 4,
        }],
      },
      options: chartOpts,
    });

    // Devices chart
    if (devicesChart) devicesChart.destroy();
    if (t.devices.length > 0) {
      devicesChart = new Chart(document.getElementById("chart-devices"), {
        type: "doughnut",
        data: {
          labels: t.devices.map((d) => d.device),
          datasets: [{
            data: t.devices.map((d) => d.views),
            backgroundColor: ["#d4a574", "#8b6f47", "#c9a96e"],
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { color: "#ccc" } },
          },
        },
      });
    }

    // Top pages table
    const pagesBody = document.querySelector("#table-pages tbody");
    pagesBody.innerHTML = t.top_pages.map((p) =>
      `<tr><td>${escHtml(p.path)}</td><td>${p.views}</td></tr>`
    ).join("") || "<tr><td colspan='2'>No data yet</td></tr>";

    // Top referrers table
    const refBody = document.querySelector("#table-referrers tbody");
    refBody.innerHTML = t.top_referrers.map((r) =>
      `<tr><td>${escHtml(truncate(r.referrer, 60))}</td><td>${r.views}</td></tr>`
    ).join("") || "<tr><td colspan='2'>No referrer data yet</td></tr>";
  }

  /* ─────────────────────── NOTIFICATIONS ─────────────────────── */

  function detectNewChats(sessions) {
    if (!sessions) return;
    const currentIds = new Set(sessions.map((s) => s.id));

    if (firstLoad) {
      knownSessionIds = currentIds;
      firstLoad = false;
      return;
    }

    const newSessions = sessions.filter((s) => !knownSessionIds.has(s.id));
    if (newSessions.length > 0 && alertsEnabled) {
      newSessions.forEach((s) => {
        fireAlert(s);
      });
    }
    knownSessionIds = currentIds;
  }

  function fireAlert(session) {
    const page = session.visitor_page || "unknown page";
    const name = session.visitor_name || "Visitor";

    // 1. Sound
    playAlertSound();

    // 2. Browser notification
    if (Notification.permission === "granted") {
      const n = new Notification("💬 New Chat!", {
        body: `${name} started a chat on ${page}`,
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💬</text></svg>",
        tag: "fc-new-chat-" + session.id,
      });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 8000);
    }

    // 3. Flash tab title
    startTitleFlash();

    // 4. Pulse the status dot
    const dot = document.getElementById("status-dot");
    if (dot) { dot.classList.add("pulse"); setTimeout(() => dot.classList.remove("pulse"), 5000); }
  }

  function playAlertSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Two-tone chime
      [0, 0.15].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = i === 0 ? 880 : 1100;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.4);
      });
    } catch (_e) { /* silent */ }
  }

  function startTitleFlash() {
    if (flashInterval) return;
    let on = true;
    flashInterval = setInterval(() => {
      document.title = on ? "🔔 New Chat!" : ORIGINAL_TITLE;
      on = !on;
    }, 800);
    // Stop flashing when window gets focus
    const stopFlash = () => {
      clearInterval(flashInterval);
      flashInterval = null;
      document.title = ORIGINAL_TITLE;
      window.removeEventListener("focus", stopFlash);
    };
    window.addEventListener("focus", stopFlash);
  }

  function toggleAlerts() {
    alertsEnabled = !alertsEnabled;
    const btn = document.getElementById("alert-toggle");
    if (btn) {
      btn.textContent = alertsEnabled ? "🔔" : "🔕";
      btn.title = alertsEnabled ? "Alerts ON — click to mute" : "Alerts OFF — click to unmute";
    }
    // Request notification permission on first enable
    if (alertsEnabled && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  // Request notification permission on login
  function requestNotifPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
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
  window.setPeriod = setPeriod;
  window.toggleAlerts = toggleAlerts;

  // Boot
  tryAutoLogin();
  requestNotifPermission();

})();
