const VENDOR_PRESETS = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"]
  },
  anthropic: {
    label: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1/",
    models: ["claude-opus-4-1-20250805", "claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219"]
  },
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"]
  },
  xai: {
    label: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    models: ["grok-4-0709", "grok-4-fast-reasoning", "grok-3-mini"]
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"]
  },
  qwen: {
    label: "通义千问（DashScope）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max-latest", "qwen-plus-latest", "qwen-turbo-latest"]
  },
  moonshot: {
    label: "Moonshot（Kimi）",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["kimi-k2-0711-preview", "kimi-thinking-preview", "moonshot-v1-128k"]
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["google/gemini-2.5-pro", "anthropic/claude-sonnet-4", "openai/gpt-4.1"]
  },
  custom: {
    label: "自定义",
    baseUrl: "",
    models: []
  }
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`接口返回非 JSON（${res.status}）`);
  }
  if (!res.ok) {
    throw new Error(data.error || `请求失败（${res.status}）`);
  }
  return data;
}

function byId(id) {
  return document.getElementById(id);
}

function showNotice(message, type = "info", timeout = 2600) {
  const el = byId("defaultApiNotice");
  el.textContent = message;
  el.className = `notice ${type}`;
  if (timeout > 0) {
    window.setTimeout(() => {
      el.className = "notice hidden";
      el.textContent = "";
    }, timeout);
  }
}

function setButtonLoading(buttonId, loading, text) {
  const btn = byId(buttonId);
  if (!btn) return;
  if (loading) {
    btn.dataset.rawText = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    return;
  }
  btn.textContent = btn.dataset.rawText || btn.textContent;
  btn.disabled = false;
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
}

function detectVendor(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  const entries = Object.entries(VENDOR_PRESETS).filter(([key]) => key !== "custom");
  const found = entries.find(([, preset]) => normalizeBaseUrl(preset.baseUrl) === normalized);
  return found ? found[0] : "custom";
}

function fillModelPresetOptions(vendor, selectedModel = "") {
  const select = byId("modelPresetSelect");
  const preset = VENDOR_PRESETS[vendor] || VENDOR_PRESETS.custom;
  const models = Array.isArray(preset.models) ? preset.models : [];
  const cleanSelected = String(selectedModel || "").trim();

  select.replaceChildren();

  if (models.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "无预设模型（请手动输入）";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    select.appendChild(option);
  });

  if (cleanSelected && models.includes(cleanSelected)) {
    select.value = cleanSelected;
    return;
  }

  if (cleanSelected && !models.includes(cleanSelected)) {
    const customOption = document.createElement("option");
    customOption.value = cleanSelected;
    customOption.textContent = `${cleanSelected}（当前已保存）`;
    select.appendChild(customOption);
    select.value = cleanSelected;
    return;
  }

  select.value = models[0];
}

function applyVendorPreset(vendor, options = {}) {
  const preset = VENDOR_PRESETS[vendor] || VENDOR_PRESETS.custom;
  const overwriteBaseUrl = options.overwriteBaseUrl !== false;
  const preferredModel = String(options.preferredModel || "").trim();

  if (overwriteBaseUrl) {
    byId("settingBaseUrl").value = preset.baseUrl || "";
  }
  fillModelPresetOptions(vendor, preferredModel);

  const manualModel = byId("settingModel").value.trim();
  if (!manualModel) {
    byId("settingModel").value = preferredModel || byId("modelPresetSelect").value || "";
  }
}

function fillForm(data) {
  const baseUrl = data.baseUrl || "";
  const model = data.model || "";
  const vendor = detectVendor(baseUrl);

  byId("vendorSelect").value = vendor;
  byId("settingBaseUrl").value = baseUrl;
  byId("settingModel").value = model;
  byId("settingApiKey").value = "";
  byId("settingApiKey").placeholder = data.hasApiKey
    ? `已保存：${data.apiKeyMasked || "已隐藏敏感信息"}`
    : "留空表示不修改 API Key";
  fillModelPresetOptions(vendor, model);
  byId("settingStatus").textContent = data.hasApiKey ? "默认 Key 已配置，可直接使用" : "默认 Key 未配置";
}

function readForm(clearKey = false) {
  const modelInput = byId("settingModel").value.trim();
  const modelPreset = byId("modelPresetSelect").value.trim();
  const apiKeyInput = byId("settingApiKey").value.trim();
  return {
    baseUrl: byId("settingBaseUrl").value.trim(),
    model: modelInput || modelPreset,
    apiKey: clearKey ? "" : apiKeyInput,
    keepApiKey: !clearKey && !apiKeyInput
  };
}

async function loadSettings() {
  const data = await api("/api/settings/ai");
  fillForm(data);
}

async function saveSettings(clearKey = false) {
  const data = await api("/api/settings/ai", {
    method: "PUT",
    body: JSON.stringify(readForm(clearKey))
  });
  if (clearKey) {
    byId("settingApiKey").value = "";
  }
  byId("settingApiKey").placeholder = data.hasApiKey
    ? `已保存：${data.apiKeyMasked || "已隐藏敏感信息"}`
    : "留空表示不修改 API Key";
  byId("settingStatus").textContent = data.hasApiKey
    ? "默认 API 已保存（Key 可用）"
    : "默认 API 已保存（当前无 Key）";
  showNotice("默认 API 配置已更新");
}

async function testSettings() {
  const data = await api("/api/settings/ai/test", {
    method: "POST",
    body: JSON.stringify(readForm(false))
  });
  byId("settingStatus").textContent = `连接成功：${data.model} @ ${data.baseUrl}`;
  showNotice("连接测试通过");
}

function bindEvents() {
  byId("vendorSelect").addEventListener("change", (event) => {
    const vendor = String(event.target.value || "custom");
    applyVendorPreset(vendor, { overwriteBaseUrl: true });
  });

  byId("modelPresetSelect").addEventListener("change", (event) => {
    byId("settingModel").value = String(event.target.value || "").trim();
  });

  byId("saveAiSettingBtn").addEventListener("click", async () => {
    setButtonLoading("saveAiSettingBtn", true, "保存中...");
    try {
      await saveSettings(false);
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("saveAiSettingBtn", false, "");
    }
  });

  byId("testAiSettingBtn").addEventListener("click", async () => {
    setButtonLoading("testAiSettingBtn", true, "测试中...");
    try {
      await testSettings();
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("testAiSettingBtn", false, "");
    }
  });

  byId("clearApiKeyBtn").addEventListener("click", async () => {
    setButtonLoading("clearApiKeyBtn", true, "处理中...");
    try {
      await saveSettings(true);
    } catch (error) {
      showNotice(error.message, "error", 5000);
    } finally {
      setButtonLoading("clearApiKeyBtn", false, "");
    }
  });
}

async function bootstrap() {
  bindEvents();
  await loadSettings();
}

bootstrap().catch((error) => showNotice(error.message, "error", 5000));
