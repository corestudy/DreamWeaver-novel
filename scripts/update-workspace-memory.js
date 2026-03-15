const fs = require('fs');
const p = 'public/workspace.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(
  /memoryStatus:\s*\{[\s\S]*?recentLogs:[\s\S]*?\}\s*\};/m,
`memoryStatus: {
    status: "not_checked",
    upToDate: false,
    contextHash: "",
    checkedAt: null,
    syncedAt: null,
    recentInjectedAt: null,
    source: "",
    detail: "",
    injectionSources: ["outline", "settings", "recent_summaries"],
    recentLogs: []
  }
};`
);

c = c.replace(
  /function renderMemoryStatus\(\) \{[\s\S]*?\n\}\n\nasync function loadMemoryStatus\(\) \{/m,
String.raw`function renderMemoryStatus() {
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

  badge.textContent = \
`状态：${statusText}`;
  badge.className = \
`badge memory-status-badge ${statusClass}`;

  const sourceHint = (memory.injectionSources || ["outline", "settings", "recent_summaries"])
    .map((item) => {
      if (item === "outline") return "大纲";
      if (item === "settings") return "设定资料";
      if (item === "recent_summaries") return "最近章节摘要";
      return item;
    })
    .join(" + ");
  detail.textContent = \
`${memory.detail || "用于校验 AI 是否读取了本书最新上下文。"}（来源：${sourceHint}）`;

  const hashShort = memory.contextHash ? String(memory.contextHash).slice(0, 12) : "-";
  meta.textContent = \
`最近检查：${formatMemoryTime(memory.checkedAt)} ｜ 最近同步：${formatMemoryTime(
    memory.syncedAt
  )} ｜ 最近注入：${formatMemoryTime(memory.recentInjectedAt)} ｜ 哈希：${hashShort}`;
}

async function loadMemoryStatus() {
`);

c = c.replace(
  /async function checkMemoryStatus\(\) \{[\s\S]*?\n\}\n\nasync function resendMemoryContext\(\) \{/m,
String.raw`async function checkMemoryStatus() {
  const result = await api(`/api/projects/${state.activeBook.id}/memory/check`, { method: "POST" });
  state.memoryStatus = result || {};
  pushLocalMemoryLog(state.activeBook.id, {
    action: "check",
    status: result.ok ? "ok" : "failed",
    detail: result.detail || "",
    source: result.source || "",
    contextHash: result.contextHash || "",
    createdAt: new Date().toISOString()
  });
  syncMemoryLogsFromStatus();
  renderMemoryStatus();
  renderMemoryLogs();
  if (result.ok) {
    showNotice("上下文读取校验通过");
    return;
  }
  showNotice(`校验失败：${result.detail || "请点击重新发送上下文"}`, "error", 5000);
}

async function resendMemoryContext() {
`);

c = c.replace(
  /async function resendMemoryContext\(\) \{[\s\S]*?\n\}\n\nfunction startLocalClock\(\) \{/m,
String.raw`async function resendMemoryContext() {
  const result = await api(`/api/projects/${state.activeBook.id}/memory/resend`, { method: "POST" });
  state.memoryStatus = result || {};
  pushLocalMemoryLog(state.activeBook.id, {
    action: "resend",
    status: result.ok ? "ok" : "failed",
    detail: result.detail || "",
    source: result.source || "",
    contextHash: result.contextHash || "",
    createdAt: new Date().toISOString()
  });
  syncMemoryLogsFromStatus();
  renderMemoryStatus();
  renderMemoryLogs();
  if (result.ok) {
    showNotice("上下文已重新发送并校验通过");
    return;
  }
  showNotice(`重新发送失败：${result.detail || "请检查 API 配置"}`, "error", 5000);
}

function startLocalClock() {
`);

if (!c.includes('composeContextInfo')) {
  c = c.replace(
    '  applyAiComposeResult(result);\n  await loadLogs();\n',
`  applyAiComposeResult(result);
  await loadLogs();

  const composeInfo = byId("composeContextInfo");
  if (composeInfo) {
    const used = Boolean(state.memoryStatus?.upToDate);
    composeInfo.textContent = used
      ? ` + "`本次生成上下文：已使用（检查 ${formatMemoryTime(state.memoryStatus?.checkedAt)}）`" + `
      : "本次生成上下文：未确认";
  }
`
  );
}

fs.writeFileSync(p, c, 'utf8');
console.log('workspace.js updated');
