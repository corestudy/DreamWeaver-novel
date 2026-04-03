const API_BASE = window.location.origin;

const state = {
  projectId: null,
  project: null,
  uploadedNovelText: "",
  uploadedNovelName: "",
  context: {
    characters: [],
    locations: [],
    rules: []
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

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("projectId"));
  return id > 0 ? id : null;
}

function showNotice(message, type = "info", timeout = 2600) {
  const el = byId("outlineNotice");
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

function setWorkspaceLinks(projectId) {
  const workspaceUrl = `/workspace.html?projectId=${projectId}`;
  byId("backWorkspaceFromOutline").href = workspaceUrl;
  byId("skipToWorkspaceLink").href = workspaceUrl;
}

function renderOutlineStatus(outlineRow) {
  const hasOutline = Boolean(String(outlineRow?.outline_text || "").trim());
  const uploaded = Number(outlineRow?.outline_uploaded || 0) === 1;
  if (!hasOutline) {
    byId("outlineStatus").textContent = "当前为空，可跳过";
    return;
  }
  byId("outlineStatus").textContent = uploaded ? "已保存且已上传给 AI" : "已保存但未上传给 AI";
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
  renderContextList("character", "outlineCharacterList", state.context.characters, "name", "profile");
  renderContextList("location", "outlineLocationList", state.context.locations, "name", "description");
  renderContextList("rule", "outlineRuleList", state.context.rules, "key_name", "value_text");
}

async function loadProject() {
  state.project = await api(`/api/projects/${state.projectId}`);
  const name = state.project?.name || "未命名作品";
  byId("outlinePageTitle").textContent = `《${name}》大纲界面`;
  byId("outlineBookMeta").textContent = state.project?.description
    ? `简介：${state.project.description}`
    : "暂无简介，可先上传文本让 AI 生成。";
}

async function loadOutline() {
  const outline = await api(`/api/projects/${state.projectId}/outline`);
  byId("outlineEditor").value = outline.outline_text || "";
  renderOutlineStatus(outline);
}

async function loadContext() {
  state.context = await api(`/api/projects/${state.projectId}/context`);
  renderContext();
}

async function addContext(type) {
  let body = {};
  if (type === "character") {
    body = {
      name: byId("outlineCharacterName").value.trim(),
      profile: byId("outlineCharacterProfile").value.trim()
    };
  }
  if (type === "location") {
    body = {
      name: byId("outlineLocationName").value.trim(),
      description: byId("outlineLocationDesc").value.trim()
    };
  }
  if (type === "rule") {
    body = {
      key_name: byId("outlineRuleKey").value.trim(),
      value_text: byId("outlineRuleValue").value.trim()
    };
  }

  await api(`/api/projects/${state.projectId}/context/${type}`, {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (type === "character") {
    byId("outlineCharacterName").value = "";
    byId("outlineCharacterProfile").value = "";
  }
  if (type === "location") {
    byId("outlineLocationName").value = "";
    byId("outlineLocationDesc").value = "";
  }
  if (type === "rule") {
    byId("outlineRuleKey").value = "";
    byId("outlineRuleValue").value = "";
  }

  await loadContext();
  showNotice("设定资料已添加");
}

async function removeContext(type, id) {
  await api(`/api/projects/${state.projectId}/context/${type}/${id}`, { method: "DELETE" });
  await loadContext();
  showNotice("设定资料已删除");
}

async function saveOutline(andEnterWorkspace = false) {
  const outlineText = byId("outlineEditor").value;
  const saved = await api(`/api/projects/${state.projectId}/outline`, {
    method: "PUT",
    body: JSON.stringify({ outlineText })
  });

  renderOutlineStatus(saved);
  showNotice("大纲已保存");

  if (andEnterWorkspace) {
    window.location.href = `/workspace.html?projectId=${state.projectId}`;
  }
}

async function uploadOutlineToAi() {
  const outlineText = byId("outlineEditor").value;
  if (!String(outlineText || "").trim()) {
    showNotice("大纲为空，无法上传给 AI", "error", 4200);
    return;
  }

  const uploaded = await api(`/api/projects/${state.projectId}/outline/upload`, {
    method: "POST",
    body: JSON.stringify({ outlineText })
  });

  renderOutlineStatus(uploaded);
  showNotice("大纲已上传给 AI，写作时会优先参考");
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file, "utf-8");
  });
}

async function onNovelFilePicked() {
  const file = byId("novelFileInput")?.files?.[0];
  if (!file) {
    state.uploadedNovelText = "";
    state.uploadedNovelName = "";
    byId("uploadedNovelMeta").textContent = "尚未选择文件";
    return;
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!["txt", "md", "markdown"].includes(ext)) {
    showNotice("当前仅支持 .txt / .md 文件", "error", 4200);
    byId("novelFileInput").value = "";
    state.uploadedNovelText = "";
    state.uploadedNovelName = "";
    byId("uploadedNovelMeta").textContent = "尚未选择文件";
    return;
  }

  const text = await readFileAsText(file);
  if (!text.trim()) {
    showNotice("文件内容为空", "error", 4200);
    return;
  }

  state.uploadedNovelText = text;
  state.uploadedNovelName = file.name;
  byId("uploadedNovelMeta").textContent = `已加载：${file.name}（${text.length} 字符）`;
}

function ensureNovelTextReady() {
  if (!state.uploadedNovelText.trim()) {
    showNotice("请先上传本地小说文本", "error", 4200);
    return false;
  }
  return true;
}

async function generateOutlineFromUpload() {
  if (!ensureNovelTextReady()) {
    return;
  }

  const result = await api(`/api/projects/${state.projectId}/outline/from-text`, {
    method: "POST",
    body: JSON.stringify({
      novelText: state.uploadedNovelText,
      promptHint: byId("outlinePromptHint").value.trim()
    })
  });

  byId("outlineEditor").value = result.outline || "";
  byId("outlineAiSource").textContent = `来源: ${result.source || "-"}`;
  showNotice("AI 已根据上传文本生成大纲");
}

async function extractContextFromUpload() {
  if (!ensureNovelTextReady()) {
    return;
  }

  const result = await api(`/api/projects/${state.projectId}/outline/from-text/context`, {
    method: "POST",
    body: JSON.stringify({
      novelText: state.uploadedNovelText,
      promptHint: byId("outlinePromptHint").value.trim()
    })
  });

  state.context = {
    characters: result.characters || [],
    locations: result.locations || [],
    rules: result.rules || []
  };
  renderContext();
  byId("contextAiSource").textContent = `设定来源: ${result.source || "-"}`;
  showNotice("AI 已提取并更新设定资料");
}

function bindEvents() {
  byId("novelFileInput").addEventListener("change", () => {
    onNovelFilePicked().catch((e) => showNotice(e.message, "error", 5000));
  });

  byId("generateOutlineFromUploadBtn").addEventListener("click", async () => {
    setButtonLoading("generateOutlineFromUploadBtn", true, "生成中...");
    try {
      await generateOutlineFromUpload();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("generateOutlineFromUploadBtn", false);
    }
  });

  byId("extractContextFromUploadBtn").addEventListener("click", async () => {
    setButtonLoading("extractContextFromUploadBtn", true, "提取中...");
    try {
      await extractContextFromUpload();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("extractContextFromUploadBtn", false);
    }
  });

  byId("saveOutlineBtn").addEventListener("click", async () => {
    setButtonLoading("saveOutlineBtn", true, "保存中...");
    try {
      await saveOutline(false);
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("saveOutlineBtn", false);
    }
  });

  byId("saveAndEnterBtn").addEventListener("click", async () => {
    setButtonLoading("saveAndEnterBtn", true, "处理中...");
    try {
      await saveOutline(true);
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("saveAndEnterBtn", false);
    }
  });

  byId("uploadOutlineBtn").addEventListener("click", async () => {
    setButtonLoading("uploadOutlineBtn", true, "上传中...");
    try {
      await uploadOutlineToAi();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("uploadOutlineBtn", false);
    }
  });

  byId("outlineAddCharacterBtn").addEventListener("click", () =>
    addContext("character").catch((e) => showNotice(e.message, "error", 5000))
  );
  byId("outlineAddLocationBtn").addEventListener("click", () =>
    addContext("location").catch((e) => showNotice(e.message, "error", 5000))
  );
  byId("outlineAddRuleBtn").addEventListener("click", () =>
    addContext("rule").catch((e) => showNotice(e.message, "error", 5000))
  );

  document.body.addEventListener("click", (event) => {
    const btn = event.target.closest(".context-item-remove");
    if (!btn) return;
    const type = btn.dataset.type;
    const id = Number(btn.dataset.id);
    removeContext(type, id).catch((error) => showNotice(error.message, "error", 5000));
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

  state.projectId = projectId;
  setWorkspaceLinks(projectId);
  bindEvents();
  await loadProject();
  await loadOutline();
  await loadContext();
}

bootstrap().catch((error) => showNotice(error.message, "error", 5000));
