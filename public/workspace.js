const API_BASE = window.location.origin;

const state = {
  activeBook: null,
  projectConfig: null,
  chapters: [],
  currentChapterId: null,
  aiResultCache: "",
  logs: [],
  chatMessages: [],
  facts: [],
  context: {
    characters: [],
    locations: [],
    rules: []
  },
  memoryStatus: {
    status: "not_checked",
    upToDate: false,
    contextHash: "",
    checkedAt: null,
    syncedAt: null,
    recentInjectedAt: null,
    source: "",
    detail: "",
    injectionSources: ["outline", "settings", "recent_summaries"]
  }
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
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function byId(id) {
  return document.getElementById(id);
}

function getAiResultEl() {
  return byId("aiResult");
}

function getAiResultText() {
  const el = getAiResultEl();
  if (el) {
    return String(el.value || "");
  }
  return String(state.aiResultCache || "");
}

function setAiResultText(text) {
  const value = String(text || "");
  state.aiResultCache = value;
  const el = getAiResultEl();
  if (el) {
    el.value = value;
  }
}

function showNotice(message, type = "info", timeout = 2600) {
  const el = byId("notice");
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

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("projectId"));
  return id > 0 ? id : null;
}

function currentChapter() {
  return state.chapters.find((item) => item.id === state.currentChapterId) || null;
}

function fillWorkspaceHeader() {
  byId("activeBookTitle").textContent = state.activeBook?.name || "未选择作品";
  byId("activeBookDesc").textContent = state.activeBook?.description || "";
  byId("editConfigLink").href = `/book-config.html?projectId=${state.activeBook?.id || ""}`;
  byId("editOutlineLink").href = `/outline.html?projectId=${state.activeBook?.id || ""}`;
}

function fillProjectConfigForm() {
  const cfg = state.projectConfig || {};
  byId("cfgSynopsisWs").value = cfg.synopsis || "";
  byId("cfgStyleWs").value = cfg.writing_style || "";
  byId("cfgPovWs").value = cfg.narrative_pov || "";
  byId("cfgToneWs").value = cfg.default_tone || "自然叙事";
  byId("cfgLengthWs").value = cfg.default_target_length || "约200-500字";

  const usingBookApi =
    Boolean(cfg.ai_base_url_override) || Boolean(cfg.has_ai_api_key_override) || Boolean(cfg.ai_model_override);
  byId("cfgStatus").textContent = usingBookApi ? "当前 AI 策略：本书专属 API 优先" : "当前 AI 策略：默认 API";
}

function readProjectConfigForm() {
  return {
    synopsis: byId("cfgSynopsisWs").value.trim(),
    writing_style: byId("cfgStyleWs").value.trim(),
    narrative_pov: byId("cfgPovWs").value.trim(),
    default_tone: byId("cfgToneWs").value.trim(),
    default_target_length: byId("cfgLengthWs").value.trim()
  };
}

async function saveProjectConfig(payload = readProjectConfigForm()) {
  state.projectConfig = await api(`/api/projects/${state.activeBook.id}/config`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  fillProjectConfigForm();
  try {
    await loadMemoryStatus();
  } catch {
    // ignore memory refresh error after config save
  }
  showNotice("本书默认写作参数已保存");
}

function renderChapters() {
  const select = byId("chapterSelect");
  select.replaceChildren();
  state.chapters.forEach((chapter) => {
    const option = document.createElement("option");
    option.value = chapter.id;
    option.textContent = `${chapter.sort_order}. ${chapter.title}`;
    select.appendChild(option);
  });
  if (state.currentChapterId) {
    select.value = String(state.currentChapterId);
  }
}

function fillEditor(chapter) {
  byId("chapterTitleEdit").value = chapter?.title || "";
  byId("chapterContent").value = chapter?.content || "";
}

function renderContextList(type, targetId, list, titleField, detailField) {
  const target = byId(targetId);
  target.replaceChildren();
  if (!Array.isArray(list) || list.length === 0) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "context-item-text";
    span.textContent = "暂无设定";
    li.appendChild(span);
    target.appendChild(li);
    return;
  }

  list.forEach((item) => {
    const li = document.createElement("li");
    const textWrap = document.createElement("div");
    textWrap.className = "context-item-text";

    const strong = document.createElement("strong");
    strong.textContent = String(item[titleField] || "");
    textWrap.appendChild(strong);

    if (item[detailField]) {
      textWrap.appendChild(document.createElement("br"));
      const detailSpan = document.createElement("span");
      detailSpan.className = "muted";
      detailSpan.textContent = String(item[detailField] || "");
      textWrap.appendChild(detailSpan);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "context-item-remove";
    removeBtn.dataset.type = type;
    removeBtn.dataset.id = String(item.id);
    removeBtn.textContent = "退场删除 ✦";

    li.appendChild(textWrap);
    li.appendChild(removeBtn);
    target.appendChild(li);
  });
}

function renderContext() {
  renderContextList("character", "characterList", state.context.characters, "name", "profile");
  renderContextList("location", "locationList", state.context.locations, "name", "description");
  renderContextList("rule", "ruleList", state.context.rules, "key_name", "value_text");
}

function renderFacts() {
  const list = byId("factList");
  list.replaceChildren();
  if (!Array.isArray(state.facts) || state.facts.length === 0) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "context-item-text";
    span.textContent = "暂无事实";
    li.appendChild(span);
    list.appendChild(li);
    return;
  }

  state.facts.forEach((fact) => {
    const li = document.createElement("li");
    const textWrap = document.createElement("div");
    textWrap.className = "context-item-text";
    textWrap.textContent = String(fact.fact_text || "");

    const removeBtn = document.createElement("button");
    removeBtn.className = "context-item-remove";
    removeBtn.dataset.type = "fact";
    removeBtn.dataset.id = String(fact.id);
    removeBtn.textContent = "退场删除 ✦";

    li.appendChild(textWrap);
    li.appendChild(removeBtn);
    list.appendChild(li);
  });
}

function renderLogs() {
  const list = byId("logList");
  list.replaceChildren();
  if (!Array.isArray(state.logs) || state.logs.length === 0) {
    const li = document.createElement("li");
    li.textContent = "暂无生成记录";
    list.appendChild(li);
    return;
  }

  state.logs.forEach((log) => {
    const li = document.createElement("li");
    li.dataset.output = log.output_text || "";
    li.dataset.logId = String(log.id);
    li.textContent = `[${log.action}] ${String(log.output_text || "").slice(0, 110)}...`;

    const btn = document.createElement("button");
    btn.className = "context-item-remove";
    btn.dataset.type = "log";
    btn.dataset.id = String(log.id);
    btn.textContent = "退场删除 ✦";
    btn.style.marginTop = "8px";
    li.appendChild(btn);

    list.appendChild(li);
  });
}

function renderWorkspaceChatMessages() {
  const list = byId("workspaceChatList");
  if (!list) return;
  list.replaceChildren();

  if (!Array.isArray(state.chatMessages) || state.chatMessages.length === 0) {
    const li = document.createElement("li");
    li.className = "chat-item assistant";

    const roleEl = document.createElement("div");
    roleEl.className = "chat-role";
    roleEl.textContent = "AI";

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "chat-bubble";
    bubbleEl.textContent = "暂无对话，开始提问吧。";

    li.appendChild(roleEl);
    li.appendChild(bubbleEl);
    list.appendChild(li);
    return;
  }

  state.chatMessages.forEach((item) => {
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

function formatMemoryTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function renderMemoryStatus() {
  const badge = byId("memoryStatusBadge");
  const detail = byId("memoryDetail");
  const meta = byId("memoryMeta");
  if (!badge || !detail || !meta) {
    return;
  }

  const memory = state.memoryStatus || {};
  let statusText = "未检查";
  let statusClass = "neutral";

  if (memory.status === "ok" && memory.upToDate) {
    statusText = "通过";
    statusClass = "ok";
  } else if (memory.status === "failed") {
    statusText = "失败";
    statusClass = "failed";
  } else if (memory.status === "stale" || (memory.status === "ok" && !memory.upToDate)) {
    statusText = "需重发";
    statusClass = "stale";
  }

  badge.textContent = `状态：${statusText}`;
  badge.className = `badge memory-status-badge ${statusClass}`;

  const sourceHint = (memory.injectionSources || ["outline", "settings", "recent_summaries"])
    .map((item) => {
      if (item === "outline") return "大纲";
      if (item === "settings") return "设定资料";
      if (item === "recent_summaries") return "最近章节摘要";
      return item;
    })
    .join(" + ");
  detail.textContent = `${memory.detail || "用于校验 AI 是否读取了本书最新上下文。"}（来源：${sourceHint}）`;

  const hashShort = memory.contextHash ? String(memory.contextHash).slice(0, 12) : "-";
  meta.textContent = `最近检查：${formatMemoryTime(memory.checkedAt)} ｜ 最近同步：${formatMemoryTime(
    memory.syncedAt
  )} ｜ 最近注入：${formatMemoryTime(memory.recentInjectedAt)} ｜ 哈希：${hashShort}`;
}

async function loadMemoryStatus() {
  state.memoryStatus = await api(`/api/projects/${state.activeBook.id}/memory/status`);
  renderMemoryStatus();
}

async function checkMemoryStatus() {
  const result = await api(`/api/projects/${state.activeBook.id}/memory/check`, { method: "POST" });
  state.memoryStatus = result || {};
  renderMemoryStatus();
  if (result.ok) {
    showNotice("上下文读取校验通过");
    return;
  }
  showNotice(`校验失败：${result.detail || "请点击重新发送上下文"}`, "error", 5000);
}

async function resendMemoryContext() {
  const result = await api(`/api/projects/${state.activeBook.id}/memory/resend`, { method: "POST" });
  state.memoryStatus = result || {};
  renderMemoryStatus();
  if (result.ok) {
    showNotice("上下文已重新发送并校验通过");
    return;
  }
  showNotice(`重新发送失败：${result.detail || "请检查 API 配置"}`, "error", 5000);
}

function startLocalClock() {
  const badge = byId("healthBadge");
  if (!badge) return;
  const render = () => {
    const now = new Date();
    const datePart = now.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
    const timePart = now.toLocaleTimeString("zh-CN", { hour12: false });
    badge.textContent = `本地时间 ${datePart} ${timePart}`;
  };
  render();
  window.setInterval(render, 1000);
}

async function loadActiveBook(projectId) {
  const shelf = await api("/api/bookshelf");
  const found = shelf.find((item) => item.id === projectId);
  if (!found) throw new Error("作品不存在");
  state.activeBook = found;
  fillWorkspaceHeader();
}

async function loadProjectConfig() {
  state.projectConfig = await api(`/api/projects/${state.activeBook.id}/config`);
  fillProjectConfigForm();
}

async function loadChapters(pickFirst = false) {
  state.chapters = await api(`/api/projects/${state.activeBook.id}/chapters`);
  if (pickFirst) {
    state.currentChapterId = state.chapters[0]?.id || null;
  } else if (!state.chapters.some((c) => c.id === state.currentChapterId)) {
    state.currentChapterId = state.chapters[0]?.id || null;
  }
  renderChapters();
  fillEditor(currentChapter());
  await loadChapterSummary();
}

async function createChapter() {
  const title = byId("chapterTitleInput").value.trim() || "未命名章节";
  const chapter = await api(`/api/projects/${state.activeBook.id}/chapters`, {
    method: "POST",
    body: JSON.stringify({ title })
  });
  byId("chapterTitleInput").value = "";
  state.currentChapterId = chapter.id;
  await loadChapters(false);
  showNotice("章节已创建");
}

async function deleteCurrentChapter() {
  if (!state.currentChapterId) {
    showNotice("请先选择章节", "error");
    return;
  }
  const oldId = state.currentChapterId;
  const ok = window.confirm("确认删除当前章节？该章节摘要、日志和事实将一并删除。");
  if (!ok) return;

  await api(`/api/chapters/${oldId}`, { method: "DELETE" });
  state.currentChapterId = null;
  await loadChapters(false);
  await loadLogs();
  await loadFacts();
  showNotice("章节已删除");
}

async function saveChapter() {
  if (!state.currentChapterId) {
    showNotice("请先创建或选择章节", "error");
    return;
  }
  const title = byId("chapterTitleEdit").value.trim() || "未命名章节";
  const content = byId("chapterContent").value;
  await api(`/api/chapters/${state.currentChapterId}`, {
    method: "PUT",
    body: JSON.stringify({ title, content })
  });
  byId("saveStatus").textContent = "已保存";
  await loadChapters(false);
}

async function loadContext() {
  state.context = await api(`/api/projects/${state.activeBook.id}/context`);
  renderContext();
}

async function addContext(type) {
  let body = {};
  if (type === "character") {
    body = { name: byId("characterName").value.trim(), profile: byId("characterProfile").value.trim() };
  }
  if (type === "location") {
    body = { name: byId("locationName").value.trim(), description: byId("locationDesc").value.trim() };
  }
  if (type === "rule") {
    body = { key_name: byId("ruleKey").value.trim(), value_text: byId("ruleValue").value.trim() };
  }

  await api(`/api/projects/${state.activeBook.id}/context/${type}`, {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (type === "character") {
    byId("characterName").value = "";
    byId("characterProfile").value = "";
  }
  if (type === "location") {
    byId("locationName").value = "";
    byId("locationDesc").value = "";
  }
  if (type === "rule") {
    byId("ruleKey").value = "";
    byId("ruleValue").value = "";
  }

  await loadContext();
  await loadMemoryStatus();
  showNotice("设定资料已添加");
}

async function removeContext(type, id) {
  await api(`/api/projects/${state.activeBook.id}/context/${type}/${id}`, { method: "DELETE" });
  await loadContext();
  await loadMemoryStatus();
  showNotice("设定资料已删除");
}

async function loadFacts() {
  state.facts = await api(`/api/projects/${state.activeBook.id}/facts`);
  renderFacts();
}

async function extractFacts() {
  if (!state.currentChapterId) {
    showNotice("请先选择章节", "error");
    return;
  }
  await saveChapter();
  const result = await api(`/api/projects/${state.activeBook.id}/facts/extract`, {
    method: "POST",
    body: JSON.stringify({ chapterId: state.currentChapterId })
  });
  state.facts = result.facts || [];
  renderFacts();
  showNotice(`已提取 ${result.count || 0} 条事实`);
}

async function deleteFact(factId) {
  await api(`/api/projects/${state.activeBook.id}/facts/${factId}`, { method: "DELETE" });
  await loadFacts();
  showNotice("事实已删除");
}

async function loadLogs() {
  state.logs = await api(`/api/projects/${state.activeBook.id}/logs`);
  renderLogs();
}

async function loadChatMessages() {
  state.chatMessages = await api(`/api/projects/${state.activeBook.id}/chat/messages`);
  renderWorkspaceChatMessages();
}

async function clearChatMessages() {
  const ok = window.confirm("确认清空本书全部聊天记录？");
  if (!ok) return;
  await api(`/api/projects/${state.activeBook.id}/chat/messages`, { method: "DELETE" });
  state.chatMessages = [];
  renderWorkspaceChatMessages();
  showNotice("本书聊天已清空");
}

async function deleteLog(logId) {
  await api(`/api/projects/${state.activeBook.id}/logs/${logId}`, { method: "DELETE" });
  await loadLogs();
  showNotice("日志已删除");
}

async function clearLogs() {
  const ok = window.confirm("确认清空本书全部生成日志？");
  if (!ok) return;
  await api(`/api/projects/${state.activeBook.id}/logs`, { method: "DELETE" });
  await loadLogs();
  showNotice("日志已清空");
}

async function loadChapterSummary() {
  if (!state.currentChapterId) {
    byId("chapterSummary").textContent = "暂无摘要";
    byId("summaryTime").textContent = "暂无";
    return;
  }

  try {
    const row = await api(`/api/chapters/${state.currentChapterId}/summary`);
    byId("chapterSummary").textContent = row.summary || "暂无摘要";
    byId("summaryTime").textContent = row.updated_at || "暂无";
  } catch {
    byId("chapterSummary").textContent = "暂无摘要";
    byId("summaryTime").textContent = "暂无";
  }
}

async function summarizeChapter() {
  if (!state.currentChapterId) {
    showNotice("请先选择章节", "error");
    return;
  }
  await saveChapter();
  const row = await api(`/api/chapters/${state.currentChapterId}/summarize`, { method: "POST" });
  byId("chapterSummary").textContent = row.summary || "";
  byId("summaryTime").textContent = row.updated_at || "刚刚";
  showNotice("摘要已更新");
}

async function deleteSummary() {
  if (!state.currentChapterId) {
    showNotice("请先选择章节", "error");
    return;
  }
  await api(`/api/chapters/${state.currentChapterId}/summary`, { method: "DELETE" });
  byId("chapterSummary").textContent = "暂无摘要";
  byId("summaryTime").textContent = "暂无";
  showNotice("摘要已删除");
}

function selectedTextInEditor() {
  const editor = byId("chapterContent");
  return editor.value.slice(editor.selectionStart, editor.selectionEnd);
}

function applyAiComposeResult(result) {
  setAiResultText(result.output || "");
  const aiSourceEl = byId("aiSource");
  if (aiSourceEl) {
    aiSourceEl.textContent = `来源: ${result.source || "-"}`;
  }
  byId("composeInstructionInput").value = "";
  state.chatMessages = result.messages || [];
  renderWorkspaceChatMessages();
}

async function runAiAction() {
  if (!state.currentChapterId) {
    showNotice("请先选择章节", "error");
    return;
  }
  await saveChapter();

  if (!state.memoryStatus?.upToDate) {
    await checkMemoryStatus();
    if (!state.memoryStatus?.upToDate) {
      throw new Error("记忆状态未通过，请先执行“重新发送上下文”后再试");
    }
  }

  const action = byId("actionSelect").value;
  const rawInstruction = byId("composeInstructionInput").value.trim();
  const instruction = action === "write" && !rawInstruction ? "请基于当前章节继续创作下一段内容" : rawInstruction;

  const result = await api(`/api/projects/${state.activeBook.id}/ai/compose`, {
    method: "POST",
    body: JSON.stringify({
      chapterId: state.currentChapterId,
      action,
      selectedText: action === "write" ? "" : selectedTextInEditor(),
      tone: byId("cfgToneWs").value.trim(),
      targetLength: byId("cfgLengthWs").value.trim(),
      instruction
    })
  });

  applyAiComposeResult(result);
  await loadLogs();

  const composeInfo = byId("composeContextInfo");
  if (composeInfo) {
    const used = Boolean(state.memoryStatus?.upToDate);
    composeInfo.textContent = used
      ? `本次生成上下文：已使用（检查 ${formatMemoryTime(state.memoryStatus?.checkedAt)}）`
      : "本次生成上下文：未确认";
  }

  if (action === "write" && String(result.output || "").trim()) {
    insertAtCursor(result.output);
    byId("saveStatus").textContent = "待保存";
    showNotice("AI 写作完成，已插入正文");
    return;
  }

  showNotice("AI 生成完成");
}


function insertAtCursor(text) {
  const editor = byId("chapterContent");
  const start = Number(editor.selectionStart || 0);
  const end = Number(editor.selectionEnd || 0);
  editor.value = `${editor.value.slice(0, start)}${text}${editor.value.slice(end)}`;
  editor.focus();
  editor.selectionStart = editor.selectionEnd = start + text.length;
}

function insertResultToCursor() {
  const text = getAiResultText().trim();
  if (!text) {
    showNotice("没有可插入内容，请先执行 AI 写作", "error");
    return;
  }
  insertAtCursor(text);
  byId("saveStatus").textContent = "待保存";
  showNotice("已插入到光标处");
}

function replaceSelectedTextWithResult() {
  const text = getAiResultText().trim();
  if (!text) {
    showNotice("没有可替换内容，请先执行 AI 写作", "error");
    return;
  }
  const editor = byId("chapterContent");
  const start = Number(editor.selectionStart || 0);
  const end = Number(editor.selectionEnd || 0);
  if (end <= start) {
    showNotice("请先在正文中选中要替换的文本", "error");
    return;
  }
  insertAtCursor(text);
  byId("saveStatus").textContent = "待保存";
  showNotice("已替换选中文本");
}

async function copyResult() {
  const text = getAiResultText().trim();
  if (!text) {
    showNotice("没有可复制内容，请先执行 AI 写作", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showNotice("已复制到剪贴板");
    return;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "readonly");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(helper);
    if (ok) {
      showNotice("已复制到剪贴板");
      return;
    }
    throw new Error("copy failed");
  }
}

function clearAiResult() {
  setAiResultText("");
  const aiSourceEl = byId("aiSource");
  if (aiSourceEl) {
    aiSourceEl.textContent = "来源: -";
  }
  showNotice("结果已清空");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeFileBaseName(name) {
  const cleaned = String(name || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
  return cleaned || "novel_export";
}

function composeExportSource(scope) {
  if (scope === "aiResult") {
    const text = getAiResultText().trim();
    if (!text) {
      throw new Error("AI 结果区为空");
    }
    return { title: `${state.activeBook?.name || "未命名作品"}_AI结果`, body: text };
  }

  if (scope === "allChapters") {
    if (!Array.isArray(state.chapters) || state.chapters.length === 0) {
      throw new Error("暂无章节可导出");
    }
    const body = state.chapters
      .map((chapter, idx) => `## 第${idx + 1}章 ${chapter.title || "未命名章节"}\n\n${chapter.content || ""}`)
      .join("\n\n");
    return { title: `${state.activeBook?.name || "未命名作品"}_全书`, body };
  }

  const chapter = currentChapter();
  if (!chapter) {
    throw new Error("请先选择章节");
  }
  return { title: `${state.activeBook?.name || "未命名作品"}_${chapter.title || "当前章节"}`, body: chapter.content || "" };
}

function convertExportText(source, format) {
  const title = source.title;
  const body = source.body;
  if (format === "md") {
    return `# ${title}\n\n${body}`;
  }
  if (format === "html") {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <pre style="white-space: pre-wrap; line-height: 1.7; font-family: Consolas, 'Microsoft YaHei', sans-serif;">${escapeHtml(body)}</pre>
</body>
</html>`;
  }
  return `${title}\n\n${body}`;
}

function browserDownload(content, fileName, format) {
  const mimeMap = {
    txt: "text/plain;charset=utf-8",
    md: "text/markdown;charset=utf-8",
    html: "text/html;charset=utf-8"
  };
  const blob = new Blob([content], { type: mimeMap[format] || mimeMap.txt });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportContent() {
  const scope = byId("exportScopeSelect").value;
  const format = byId("exportFormatSelect").value;
  const source = composeExportSource(scope);
  const payloadText = convertExportText(source, format);
  const inputName = byId("exportFileNameInput").value.trim();
  const fileBaseName = sanitizeFileBaseName(inputName || source.title);

  const desktopApi = window.novelDesktop && typeof window.novelDesktop.saveExportFile === "function";
  if (desktopApi) {
    const result = await window.novelDesktop.saveExportFile({
      content: payloadText,
      extension: format,
      defaultFileName: `${fileBaseName}.${format}`
    });
    if (result?.canceled) {
      showNotice("已取消导出", "info");
      return;
    }
    showNotice(`导出成功：${result.filePath}`);
    return;
  }

  browserDownload(payloadText, fileBaseName, format);
  showNotice("已触发浏览器下载");
}

function bindEvents() {
  byId("createChapterBtn").addEventListener("click", async () => {
    setButtonLoading("createChapterBtn", true, "新增中...");
    try {
      await createChapter();
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setButtonLoading("createChapterBtn", false);
    }
  });

  byId("deleteChapterBtn").addEventListener("click", () =>
    deleteCurrentChapter().catch((e) => showNotice(e.message, "error", 5000))
  );

  byId("chapterSelect").addEventListener("change", async (event) => {
    state.currentChapterId = Number(event.target.value);
    fillEditor(currentChapter());
    await loadChapterSummary();
  });

  byId("saveChapterBtn").addEventListener("click", async () => {
    setButtonLoading("saveChapterBtn", true, "保存中...");
    try {
      await saveChapter();
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setButtonLoading("saveChapterBtn", false);
    }
  });

  byId("summarizeBtn").addEventListener("click", async () => {
    setButtonLoading("summarizeBtn", true, "生成中...");
    try {
      await summarizeChapter();
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setButtonLoading("summarizeBtn", false);
    }
  });

  byId("deleteSummaryBtn").addEventListener("click", () =>
    deleteSummary().catch((e) => showNotice(e.message, "error", 5000))
  );

  byId("runAiBtn").addEventListener("click", async () => {
    setButtonLoading("runAiBtn", true, "生成中...");
    try {
      await runAiAction();
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setButtonLoading("runAiBtn", false);
    }
  });


  byId("checkMemoryBtn").addEventListener("click", async () => {
    setButtonLoading("checkMemoryBtn", true, "校验中...");
    try {
      await checkMemoryStatus();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("checkMemoryBtn", false);
    }
  });

  byId("resendMemoryBtn").addEventListener("click", async () => {
    setButtonLoading("resendMemoryBtn", true, "发送中...");
    try {
      await resendMemoryContext();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("resendMemoryBtn", false);
    }
  });

  byId("clearChatBtn").addEventListener("click", () =>
    clearChatMessages().catch((e) => showNotice(e.message, "error", 5000))
  );

  byId("composeInstructionInput").addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      byId("runAiBtn").click();
    }
  });

  byId("saveProjectConfigBtn").addEventListener("click", async () => {
    setButtonLoading("saveProjectConfigBtn", true, "保存中...");
    try {
      await saveProjectConfig();
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setButtonLoading("saveProjectConfigBtn", false);
    }
  });

  byId("clearProjectConfigBtn").addEventListener("click", async () => {
    setButtonLoading("clearProjectConfigBtn", true, "清空中...");
    try {
      await saveProjectConfig({
        synopsis: "",
        writing_style: "",
        narrative_pov: "",
        default_tone: "",
        default_target_length: ""
      });
      showNotice("本书参数已清空");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setButtonLoading("clearProjectConfigBtn", false);
    }
  });

  byId("extractFactsBtn").addEventListener("click", async () => {
    setButtonLoading("extractFactsBtn", true, "提取中...");
    try {
      await extractFacts();
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setButtonLoading("extractFactsBtn", false);
    }
  });

  byId("clearLogsBtn").addEventListener("click", () =>
    clearLogs().catch((e) => showNotice(e.message, "error", 5000))
  );

  byId("insertResultBtn").addEventListener("click", insertResultToCursor);
  byId("replaceSelectionBtn").addEventListener("click", replaceSelectedTextWithResult);
  byId("copyResultBtn").addEventListener("click", () => copyResult().catch(() => showNotice("复制失败", "error")));
  byId("clearAiResultBtn").addEventListener("click", clearAiResult);
  byId("exportBtn").addEventListener("click", async () => {
    setButtonLoading("exportBtn", true, "导出中...");
    try {
      await exportContent();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("exportBtn", false);
    }
  });

  byId("addCharacterBtn").addEventListener("click", () =>
    addContext("character").catch((e) => showNotice(e.message, "error"))
  );
  byId("addLocationBtn").addEventListener("click", () =>
    addContext("location").catch((e) => showNotice(e.message, "error"))
  );
  byId("addRuleBtn").addEventListener("click", () => addContext("rule").catch((e) => showNotice(e.message, "error")));

  document.body.addEventListener("click", (event) => {
    const removeBtn = event.target.closest(".context-item-remove");
    if (removeBtn) {
      const type = removeBtn.dataset.type;
      const id = Number(removeBtn.dataset.id);
      if (type === "fact") {
        deleteFact(id).catch((error) => showNotice(error.message, "error"));
        return;
      }
      if (type === "log") {
        deleteLog(id).catch((error) => showNotice(error.message, "error"));
        return;
      }
      removeContext(type, id).catch((error) => showNotice(error.message, "error"));
      return;
    }

    const logItem = event.target.closest("#logList li");
    if (logItem && logItem.dataset.output && !event.target.closest("button")) {
      setAiResultText(logItem.dataset.output);
      showNotice("记录已回填到结果框");
    }
  });
}

async function bootstrap() {
  const projectId = getProjectIdFromUrl();
  if (!projectId) {
    showNotice("缺少 projectId，正在返回书架", "error", 1800);
    window.setTimeout(() => {
      window.location.href = "/shelf.html";
    }, 1800);
    return;
  }

  bindEvents();
  startLocalClock();

  await loadActiveBook(projectId);
  await loadProjectConfig();
  await loadChapters(true);
  await loadContext();
  await loadMemoryStatus();
  await loadFacts();
  await loadLogs();
  await loadChatMessages();
}

bootstrap().catch((error) => {
  showNotice(error.message, "error", 5000);
});






