const API_BASE = window.location.origin;

const state = {
  sessionToken: "",
  status: "idle",
  projectId: null,
  messages: [],
  source: "",
  outline: "",
  characters: [],
  locations: [],
  rules: []
};

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`API returned non-JSON (${res.status})`);
  }
  if (!res.ok) {
    const message = String(data.error || `Request failed (${res.status})`);
    if (res.status === 404 && path.startsWith("/api/cheat-mode/") && message.includes("api route not found")) {
      throw new Error("当前服务为旧版本，请先重启 `npm run dev` 后再使用开挂模式");
    }
    throw new Error(message);
  }
  return data;
}

function byId(id) {
  return document.getElementById(id);
}

function showNotice(message, type = "info", timeout = 3200) {
  const el = byId("cheatNotice");
  el.textContent = message;
  el.className = `notice ${type}`;
  if (timeout > 0) {
    window.setTimeout(() => {
      el.className = "notice hidden";
      el.textContent = "";
    }, timeout);
  }
}

function setButtonLoading(buttonId, loading, loadingText) {
  const btn = byId(buttonId);
  if (!btn) return;
  if (loading) {
    btn.dataset.rawText = btn.textContent;
    btn.textContent = loadingText;
    btn.disabled = true;
    return;
  }
  btn.textContent = btn.dataset.rawText || btn.textContent;
  btn.disabled = false;
}

function renderMessages() {
  const list = byId("cheatChatList");
  list.replaceChildren();

  if (!Array.isArray(state.messages) || state.messages.length === 0) {
    const li = document.createElement("li");
    li.className = "chat-item assistant";
    const roleEl = document.createElement("div");
    roleEl.className = "chat-role";
    roleEl.textContent = "AI";
    const bubbleEl = document.createElement("div");
    bubbleEl.className = "chat-bubble";
    bubbleEl.textContent = "暂无访谈记录，请先发送第一条问题。";
    li.appendChild(roleEl);
    li.appendChild(bubbleEl);
    list.appendChild(li);
    return;
  }

  state.messages.forEach((item) => {
    const role = item.role === "user" ? "user" : "assistant";
    const li = document.createElement("li");
    li.className = "chat-item " + role;
    const who = role === "user" ? "你" : "AI";

    const roleEl = document.createElement("div");
    roleEl.className = "chat-role";
    roleEl.textContent = item.created_at ? (who + " · " + item.created_at) : who;

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "chat-bubble";
    bubbleEl.textContent = String(item.content || "");

    li.appendChild(roleEl);
    li.appendChild(bubbleEl);
    list.appendChild(li);
  });

  list.scrollTop = list.scrollHeight;
}

function renderStatus() {
  const statusMap = {
    idle: "未开始",
    active: "进行中",
    completed: "已完成"
  };
  byId("sessionStatusText").textContent = `状态：${statusMap[state.status] || state.status}`;

  const canGo = Boolean(state.projectId);
  byId("gotoWorkspaceBtn").disabled = !canGo;

  const contextCount = `人物 ${state.characters.length} / 地点 ${state.locations.length} / 规则 ${state.rules.length}`;
  byId("contextSummaryText").textContent = canGo ? `设定资料：${contextCount}` : "设定资料：-";
  byId("generateSourceText").textContent = `来源：${state.source || "-"}`;
  byId("outlinePreview").value = state.outline || "";
}

async function createSession() {
  const bookName = byId("bookNameInput").value.trim();
  const session = await api("/api/cheat-mode/sessions", {
    method: "POST",
    body: JSON.stringify({ bookName })
  });

  state.sessionToken = session.sessionToken;
  state.status = session.status || "active";
  state.projectId = session.projectId || null;
  state.messages = [];
  localStorage.setItem("cheat_mode_session_token", state.sessionToken);

  renderMessages();
  renderStatus();
  showNotice("访谈会话已创建");
}

async function ensureSession() {
  if (state.sessionToken) {
    return;
  }
  await createSession();
}

async function loadSessionByToken(token) {
  const session = await api(`/api/cheat-mode/sessions/${encodeURIComponent(token)}`);
  state.sessionToken = session.sessionToken;
  state.status = session.status || "active";
  state.projectId = session.projectId || null;
  if (session.bookName) {
    byId("bookNameInput").value = session.bookName;
  }

  const messages = await api(`/api/cheat-mode/sessions/${encodeURIComponent(token)}/messages`);
  state.messages = Array.isArray(messages) ? messages : [];

  renderMessages();
  renderStatus();
}

async function sendMessage() {
  const message = byId("chatInput").value.trim();
  if (!message) {
    showNotice("请输入消息", "error");
    return;
  }

  await ensureSession();
  const result = await api(`/api/cheat-mode/sessions/${encodeURIComponent(state.sessionToken)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message })
  });

  state.messages = result.messages || [];
  state.status = "active";
  byId("chatInput").value = "";
  renderMessages();
  renderStatus();
}

async function finishInterview() {
  await ensureSession();
  const result = await api(`/api/cheat-mode/sessions/${encodeURIComponent(state.sessionToken)}/finish`, {
    method: "POST",
    body: JSON.stringify({ bookName: byId("bookNameInput").value.trim() })
  });

  state.status = "completed";
  state.projectId = Number(result.projectId || 0) || null;
  state.source = String(result.source || "");
  state.outline = String(result.outline || "");
  state.characters = Array.isArray(result.characters) ? result.characters : [];
  state.locations = Array.isArray(result.locations) ? result.locations : [];
  state.rules = Array.isArray(result.rules) ? result.rules : [];

  renderStatus();
  showNotice("已生成大纲与设定资料，可以进入工作台", "info", 4200);
}

function bindEvents() {
  byId("startSessionBtn").addEventListener("click", async () => {
    setButtonLoading("startSessionBtn", true, "创建中...");
    try {
      await createSession();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("startSessionBtn", false);
    }
  });

  byId("sendChatBtn").addEventListener("click", async () => {
    setButtonLoading("sendChatBtn", true, "发送中...");
    try {
      await sendMessage();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("sendChatBtn", false);
    }
  });

  byId("chatInput").addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      byId("sendChatBtn").click();
    }
  });

  byId("finishInterviewBtn").addEventListener("click", async () => {
    setButtonLoading("finishInterviewBtn", true, "生成中...");
    try {
      await finishInterview();
    } catch (error) {
      showNotice(error.message, "error", 6000);
    } finally {
      setButtonLoading("finishInterviewBtn", false);
    }
  });

  byId("gotoWorkspaceBtn").addEventListener("click", () => {
    if (!state.projectId) {
      showNotice("请先结束访谈并生成", "error");
      return;
    }
    window.location.href = `/workspace.html?projectId=${state.projectId}`;
  });

  byId("clearInputBtn").addEventListener("click", () => {
    byId("chatInput").value = "";
  });
}

async function bootstrap() {
  bindEvents();
  renderMessages();
  renderStatus();

  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = String(params.get("sessionToken") || "").trim();
  const tokenFromStorage = String(localStorage.getItem("cheat_mode_session_token") || "").trim();
  const token = tokenFromUrl || tokenFromStorage;

  if (token) {
    try {
      await loadSessionByToken(token);
    } catch {
      localStorage.removeItem("cheat_mode_session_token");
    }
  }
}

bootstrap().catch((error) => {
  showNotice(error.message, "error", 5000);
});

