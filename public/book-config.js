const API_BASE = window.location.origin;

const state = {
  editProjectId: null,
  mode: "create"
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
  const el = byId("configNotice");
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

function readBookForm() {
  return {
    name: byId("bookName").value.trim(),
    description: byId("bookDesc").value.trim(),
    coverImage: byId("bookCoverImage").value.trim()
  };
}

function readBookAiOverrideForm(options = {}) {
  const forceClearApiKey = Boolean(options.forceClearApiKey);
  const apiKeyInput = byId("cfgAiApiKeyOverride").value.trim();
  return {
    ai_base_url_override: byId("cfgAiBaseUrlOverride").value.trim(),
    ai_model_override: byId("cfgModelOverride").value.trim(),
    ai_api_key_override: forceClearApiKey ? "" : apiKeyInput,
    keep_ai_api_key_override: forceClearApiKey ? false : !apiKeyInput
  };
}

function fillBookForm(project, config) {
  byId("bookName").value = project?.name || "";
  byId("bookDesc").value = project?.description || "";
  byId("bookCoverImage").value = project?.cover_image || "";
  renderCoverPreview(project?.cover_image || "");

  byId("cfgModelOverride").value = config?.ai_model_override || "";
  byId("cfgAiBaseUrlOverride").value = config?.ai_base_url_override || "";
  byId("cfgAiApiKeyOverride").value = "";
  byId("cfgAiApiKeyOverride").placeholder = config?.has_ai_api_key_override
    ? `已保存：${config.ai_api_key_override_masked || "已隐藏敏感信息"}`
    : "留空表示沿用默认 API Key";
}

function renderCoverPreview(imageValue) {
  const img = byId("bookCoverPreview");
  const src = String(imageValue || "").trim();
  if (!src) {
    img.src = "";
    img.classList.add("hidden");
    return;
  }

  img.src = src;
  img.classList.remove("hidden");
}

function setBookAiOverrideStatus(message) {
  byId("bookAiOverrideStatus").textContent = message;
}

function ensureEditModeForBookAi() {
  if (state.mode !== "edit" || !state.editProjectId) {
    showNotice("请先创建书籍，再单独保存/测试本书专属 API", "error", 4200);
    return false;
  }
  return true;
}

async function loadEditData(projectId) {
  const [project, config] = await Promise.all([
    api(`/api/projects/${projectId}`),
    api(`/api/projects/${projectId}/config`)
  ]);

  fillBookForm(project, config);
  setBookAiOverrideStatus("已加载本书专属 API 配置");

  const backLink = byId("backWorkspaceLink");
  backLink.href = `/workspace.html?projectId=${projectId}`;
  backLink.classList.remove("hidden");
}

async function createBookWithConfig() {
  const form = readBookForm();
  const ai = readBookAiOverrideForm();

  if (!form.name) {
    showNotice("作品名称不能为空", "error");
    return;
  }

  const created = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: form.name,
      description: form.description,
      coverImage: form.coverImage
    })
  });

  await api(`/api/projects/${created.id}/config`, {
    method: "PUT",
    body: JSON.stringify(ai)
  });

  window.location.href = `/outline.html?projectId=${created.id}`;
}

async function updateBookWithConfig(projectId) {
  const form = readBookForm();
  const ai = readBookAiOverrideForm();

  if (!form.name) {
    showNotice("作品名称不能为空", "error");
    return;
  }

  await api(`/api/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: form.name,
      description: form.description,
      coverImage: form.coverImage
    })
  });

  await api(`/api/projects/${projectId}/config`, {
    method: "PUT",
    body: JSON.stringify(ai)
  });

  showNotice("本书配置已更新，正在返回书架...");
  window.setTimeout(() => {
    window.location.href = "/shelf.html";
  }, 900);
}

async function saveBookAiOverride(options = {}) {
  if (!ensureEditModeForBookAi()) {
    return;
  }

  const ai = readBookAiOverrideForm(options);
  await api(`/api/projects/${state.editProjectId}/config`, {
    method: "PUT",
    body: JSON.stringify(ai)
  });

  setBookAiOverrideStatus("本书专属 API 已保存");
  showNotice("本书专属 API 已保存");
}

async function clearBookAiOverride() {
  if (!ensureEditModeForBookAi()) {
    return;
  }

  byId("cfgAiBaseUrlOverride").value = "";
  byId("cfgModelOverride").value = "";
  byId("cfgAiApiKeyOverride").value = "";

  await saveBookAiOverride({ forceClearApiKey: true });
  setBookAiOverrideStatus("本书专属 API 已清空，将回退默认 API");
}

async function testBookAiOverride() {
  if (!ensureEditModeForBookAi()) {
    return;
  }

  const result = await api(`/api/projects/${state.editProjectId}/ai/test`, {
    method: "POST",
    body: JSON.stringify(readBookAiOverrideForm())
  });

  setBookAiOverrideStatus(`连接成功: ${result.model} @ ${result.baseUrl}`);
  showNotice("本书专属 API 测试通过");
}

function setMode(mode) {
  state.mode = mode;

  if (mode === "edit") {
    byId("configPageTitle").textContent = "编辑书籍配置";
    byId("configPageDesc").textContent = "修改本书核心参数与专属 AI 设置。";
    byId("saveBookConfigBtn").textContent = "保存配置并返回书架";
    return;
  }

  byId("backWorkspaceLink").classList.add("hidden");
  byId("configPageTitle").textContent = "新书配置";
  byId("configPageDesc").textContent = "先完善核心信息，再进入大纲页面。";
  byId("saveBookConfigBtn").textContent = "创建并进入大纲界面";
}

function bindEvents() {
  byId("saveBookConfigBtn").addEventListener("click", async () => {
    setButtonLoading("saveBookConfigBtn", true, "处理中...");
    try {
      if (state.mode === "edit" && state.editProjectId) {
        await updateBookWithConfig(state.editProjectId);
      } else {
        await createBookWithConfig();
      }
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("saveBookConfigBtn", false);
    }
  });

  byId("saveBookAiOverrideBtn").addEventListener("click", async () => {
    setButtonLoading("saveBookAiOverrideBtn", true, "保存中...");
    try {
      await saveBookAiOverride();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("saveBookAiOverrideBtn", false);
    }
  });

  byId("testBookAiOverrideBtn").addEventListener("click", async () => {
    setButtonLoading("testBookAiOverrideBtn", true, "测试中...");
    try {
      await testBookAiOverride();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("testBookAiOverrideBtn", false);
    }
  });

  byId("clearBookAiOverrideBtn").addEventListener("click", async () => {
    setButtonLoading("clearBookAiOverrideBtn", true, "处理中...");
    try {
      await clearBookAiOverride();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("clearBookAiOverrideBtn", false);
    }
  });

  byId("bookCoverImage").addEventListener("input", (event) => {
    renderCoverPreview(event.target.value);
  });

  byId("bookCoverFile").addEventListener("change", () => {
    const file = byId("bookCoverFile").files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      byId("bookCoverImage").value = value;
      renderCoverPreview(value);
      showNotice("本地封面已读取，可直接保存");
    };
    reader.readAsDataURL(file);
  });
}

async function bootstrap() {
  bindEvents();

  const projectId = getProjectIdFromUrl();
  if (projectId) {
    state.editProjectId = projectId;
    setMode("edit");
    await loadEditData(projectId);
  } else {
    setMode("create");
    setBookAiOverrideStatus("新建模式：创建后可单独保存/测试本书专属 API");
  }
}

bootstrap().catch((error) => showNotice(error.message, "error", 5000));
