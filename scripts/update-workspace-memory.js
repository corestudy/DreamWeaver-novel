const fs = require('fs');

const targetPath = 'public/workspace.js';
let content = fs.readFileSync(targetPath, 'utf8');

const hitStats = [];

function applyReplace(name, regex, replacement, minHits = 1) {
  let hits = 0;
  content = content.replace(regex, () => {
    hits += 1;
    return replacement;
  });
  hitStats.push({ name, hits });
  if (hits < minHits) {
    throw new Error(`replace failed: ${name}, expected >= ${minHits}, got ${hits}`);
  }
}

const memoryStatusReplacement = [
  'memoryStatus: {',
  '    status: "not_checked",',
  '    upToDate: false,',
  '    contextHash: "",',
  '    checkedAt: null,',
  '    syncedAt: null,',
  '    recentInjectedAt: null,',
  '    source: "",',
  '    detail: "",',
  '    injectionSources: ["outline", "settings", "recent_summaries"]',
  '  }',
  '};'
].join('\n');

applyReplace(
  'state.memoryStatus',
  /memoryStatus:\s*\{[\s\S]*?\}\s*\n\s*\};/m,
  memoryStatusReplacement
);

const renderMemoryStatusReplacement = [
  'function renderMemoryStatus() {',
  '  const badge = byId("memoryStatusBadge");',
  '  const detail = byId("memoryDetail");',
  '  const meta = byId("memoryMeta");',
  '  if (!badge || !detail || !meta) {',
  '    return;',
  '  }',
  '',
  '  const memory = state.memoryStatus || {};',
  '  let statusText = "未检查";',
  '  let statusClass = "neutral";',
  '',
  '  if (memory.status === "ok" && memory.upToDate) {',
  '    statusText = "通过";',
  '    statusClass = "ok";',
  '  } else if (memory.status === "failed") {',
  '    statusText = "失败";',
  '    statusClass = "failed";',
  '  } else if (memory.status === "stale" || (memory.status === "ok" && !memory.upToDate)) {',
  '    statusText = "需重发";',
  '    statusClass = "stale";',
  '  }',
  '',
  '  badge.textContent = `状态：${statusText}`;',
  '  badge.className = `badge memory-status-badge ${statusClass}`;',
  '',
  '  const sourceHint = (memory.injectionSources || ["outline", "settings", "recent_summaries"])',
  '    .map((item) => {',
  '      if (item === "outline") return "大纲";',
  '      if (item === "settings") return "设定资料";',
  '      if (item === "recent_summaries") return "最近章节摘要";',
  '      return item;',
  '    })',
  '    .join(" + ");',
  '  detail.textContent = `${memory.detail || "用于校验 AI 是否读取了本书最新上下文。"}（来源：${sourceHint}）`;',
  '',
  '  const hashShort = memory.contextHash ? String(memory.contextHash).slice(0, 12) : "-";',
  '  meta.textContent = `最近检查：${formatMemoryTime(memory.checkedAt)} ｜ 最近同步：${formatMemoryTime(',
  '    memory.syncedAt',
  '  )} ｜ 最近注入：${formatMemoryTime(memory.recentInjectedAt)} ｜ 哈希：${hashShort}`;',
  '}',
  '',
  'async function loadMemoryStatus() {'
].join('\n');

applyReplace(
  'renderMemoryStatus block',
  /function renderMemoryStatus\(\) \{[\s\S]*?\n\}\n\nasync function loadMemoryStatus\(\) \{/m,
  renderMemoryStatusReplacement
);

const checkMemoryStatusReplacement = [
  'async function checkMemoryStatus() {',
  '  const result = await api(`/api/projects/${state.activeBook.id}/memory/check`, { method: "POST" });',
  '  state.memoryStatus = result || {};',
  '  renderMemoryStatus();',
  '  if (result.ok) {',
  '    showNotice("上下文读取校验通过");',
  '    return;',
  '  }',
  '  showNotice(`校验失败：${result.detail || "请点击重新发送上下文"}`, "error", 5000);',
  '}',
  '',
  'async function resendMemoryContext() {'
].join('\n');

applyReplace(
  'checkMemoryStatus block',
  /async function checkMemoryStatus\(\) \{[\s\S]*?\n\}\n\nasync function resendMemoryContext\(\) \{/m,
  checkMemoryStatusReplacement
);

const resendMemoryContextReplacement = [
  'async function resendMemoryContext() {',
  '  const result = await api(`/api/projects/${state.activeBook.id}/memory/resend`, { method: "POST" });',
  '  state.memoryStatus = result || {};',
  '  renderMemoryStatus();',
  '  if (result.ok) {',
  '    showNotice("上下文已重新发送并校验通过");',
  '    return;',
  '  }',
  '  showNotice(`重新发送失败：${result.detail || "请检查 API 配置"}`, "error", 5000);',
  '}',
  '',
  'function startLocalClock() {'
].join('\n');

applyReplace(
  'resendMemoryContext block',
  /async function resendMemoryContext\(\) \{[\s\S]*?\n\}\n\nfunction startLocalClock\(\) \{/m,
  resendMemoryContextReplacement
);

if (!content.includes('composeContextInfo')) {
  const composeInfoPatch = [
    '  applyAiComposeResult(result);',
    '  await loadLogs();',
    '',
    '  const composeInfo = byId("composeContextInfo");',
    '  if (composeInfo) {',
    '    const used = Boolean(state.memoryStatus?.upToDate);',
    '    composeInfo.textContent = used',
    '      ? `本次生成上下文：已使用（检查 ${formatMemoryTime(state.memoryStatus?.checkedAt)}）`',
    '      : "本次生成上下文：未确认";',
    '  }',
    ''
  ].join('\n');

  applyReplace('runAiAction compose info', /  applyAiComposeResult\(result\);\n  await loadLogs\(\);\n/, composeInfoPatch, 1);
} else {
  hitStats.push({ name: 'runAiAction compose info', hits: 0 });
}

fs.writeFileSync(targetPath, content, 'utf8');

console.log(`updated: ${targetPath}`);
for (const item of hitStats) {
  console.log(`hits: ${item.name} = ${item.hits}`);
}

