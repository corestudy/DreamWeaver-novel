require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { db, initDb } = require("./db");
const {
  generateNovelText,
  summarizeChapter,
  extractStoryFacts,
  generateOutline,
  generateOutlineFromNovelText,
  extractContextFromNovelText,
  generateProjectChatReply,
  generateCheatModeGuideReply,
  generateOutlineAndContextFromInterview,
  verifyProjectMemoryReceipt,
  normalizeAiConfig,
  testAiConnection
} = require("./ai");

initDb();

const app = express();
const port = Number(process.env.PORT || 3000);
let serverInstance = null;

const allowedOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS blocked"));
    }
  })
);
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function getSetting(keyName) {
  const row = db.prepare("SELECT value_text FROM app_settings WHERE key_name = ?").get(keyName);
  return row ? row.value_text : "";
}

function setSetting(keyName, valueText) {
  db.prepare(
    "INSERT INTO app_settings (key_name, value_text, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key_name) DO UPDATE SET value_text = excluded.value_text, updated_at = datetime('now')"
  ).run(keyName, valueText);
}

function getAiConfig() {
  return normalizeAiConfig({
    apiKey: getSetting("ai_api_key"),
    baseUrl: getSetting("ai_base_url"),
    model: getSetting("ai_model")
  });
}

function resolveAiConfigForProject(projectConfig) {
  const globalCfg = getAiConfig();
  return normalizeAiConfig({
    apiKey: projectConfig?.ai_api_key_override || globalCfg.apiKey,
    baseUrl: projectConfig?.ai_base_url_override || globalCfg.baseUrl,
    model: projectConfig?.ai_model_override || globalCfg.model
  });
}

function projectExists(projectId) {
  const row = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
  return Boolean(row);
}

function normalizeColor(input) {
  const value = String(input || "").trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
    return value;
  }
  return "#0f766e";
}

function getProjectConfig(projectId) {
  const row = db.prepare("SELECT * FROM project_configs WHERE project_id = ?").get(projectId);
  if (row) {
    return row;
  }
  return {
    project_id: projectId,
    synopsis: "",
    writing_style: "",
    narrative_pov: "",
    default_tone: "自然叙事",
    default_target_length: "约200-500字",
    ai_base_url_override: "",
    ai_api_key_override: "",
    ai_model_override: "",
    outline_text: "",
    outline_uploaded: 0,
    outline_uploaded_at: null,
    updated_at: null
  };
}

function upsertProjectConfig(projectId, payload) {
  const oldConfig = getProjectConfig(projectId);
  const next = {
    synopsis: typeof payload.synopsis === "string" ? payload.synopsis.trim() : oldConfig.synopsis,
    writing_style: typeof payload.writing_style === "string" ? payload.writing_style.trim() : oldConfig.writing_style,
    narrative_pov: typeof payload.narrative_pov === "string" ? payload.narrative_pov.trim() : oldConfig.narrative_pov,
    default_tone: typeof payload.default_tone === "string" ? payload.default_tone.trim() : oldConfig.default_tone,
    default_target_length:
      typeof payload.default_target_length === "string"
        ? payload.default_target_length.trim()
        : oldConfig.default_target_length,
    ai_base_url_override:
      typeof payload.ai_base_url_override === "string"
        ? payload.ai_base_url_override.trim()
        : oldConfig.ai_base_url_override,
    ai_api_key_override:
      typeof payload.ai_api_key_override === "string"
        ? payload.ai_api_key_override.trim()
        : oldConfig.ai_api_key_override,
    ai_model_override:
      typeof payload.ai_model_override === "string" ? payload.ai_model_override.trim() : oldConfig.ai_model_override
  };

  db.prepare(
    "INSERT INTO project_configs (project_id, synopsis, writing_style, narrative_pov, default_tone, default_target_length, ai_base_url_override, ai_api_key_override, ai_model_override, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(project_id) DO UPDATE SET synopsis = excluded.synopsis, writing_style = excluded.writing_style, narrative_pov = excluded.narrative_pov, default_tone = excluded.default_tone, default_target_length = excluded.default_target_length, ai_base_url_override = excluded.ai_base_url_override, ai_api_key_override = excluded.ai_api_key_override, ai_model_override = excluded.ai_model_override, updated_at = datetime('now')"
  ).run(
    projectId,
    next.synopsis,
    next.writing_style,
    next.narrative_pov,
    next.default_tone,
    next.default_target_length,
    next.ai_base_url_override,
    next.ai_api_key_override,
    next.ai_model_override
  );

  return getProjectConfig(projectId);
}

function getProjectOutline(projectId) {
  const config = getProjectConfig(projectId);
  return {
    project_id: projectId,
    outline_text: config.outline_text || "",
    outline_uploaded: Number(config.outline_uploaded || 0),
    outline_uploaded_at: config.outline_uploaded_at || null,
    updated_at: config.updated_at || null
  };
}

function saveProjectOutline(projectId, outlineText) {
  db.prepare(
    "INSERT INTO project_configs (project_id, outline_text, outline_uploaded, outline_uploaded_at, updated_at) VALUES (?, ?, 0, NULL, datetime('now')) ON CONFLICT(project_id) DO UPDATE SET outline_text = excluded.outline_text, outline_uploaded = 0, outline_uploaded_at = NULL, updated_at = datetime('now')"
  ).run(projectId, outlineText);
  return getProjectOutline(projectId);
}

function uploadProjectOutline(projectId, outlineText) {
  db.prepare(
    "INSERT INTO project_configs (project_id, outline_text, outline_uploaded, outline_uploaded_at, updated_at) VALUES (?, ?, 1, datetime('now'), datetime('now')) ON CONFLICT(project_id) DO UPDATE SET outline_text = excluded.outline_text, outline_uploaded = 1, outline_uploaded_at = datetime('now'), updated_at = datetime('now')"
  ).run(projectId, outlineText);
  return getProjectOutline(projectId);
}

function getStoryFacts(projectId, limit = 30) {
  return db
    .prepare(
      "SELECT id, project_id, chapter_id, fact_text, created_at FROM story_facts WHERE project_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(projectId, Number(limit));
}

function getProjectChatMessages(projectId, limit = 80) {
  const rows = db
    .prepare(
      "SELECT id, project_id, role, content, source, created_at FROM project_chat_messages WHERE project_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(projectId, Number(limit));
  return rows.reverse();
}

function getProjectContextRecords(projectId, limit = 40) {
  return {
    characters: db
      .prepare("SELECT id, name, profile FROM characters WHERE project_id = ? ORDER BY id DESC LIMIT ?")
      .all(projectId, Number(limit)),
    locations: db
      .prepare("SELECT id, name, description FROM locations WHERE project_id = ? ORDER BY id DESC LIMIT ?")
      .all(projectId, Number(limit)),
    rules: db
      .prepare("SELECT id, key_name, value_text FROM world_settings WHERE project_id = ? ORDER BY id DESC LIMIT ?")
      .all(projectId, Number(limit))
  };
}

function formatMemoryList(list, titleField, detailField) {
  if (!Array.isArray(list) || list.length === 0) {
    return "none";
  }
  return list
    .map((item) => `- ${String(item[titleField] || "").trim()}: ${String(item[detailField] || "").trim()}`)
    .join("\n");
}

function buildProjectMemorySnapshot(projectId) {
  const project = db.prepare("SELECT id, name, description FROM projects WHERE id = ?").get(projectId);
  const projectConfig = getProjectConfig(projectId);
  const context = getProjectContextRecords(projectId, 40);

  const summaries = db
    .prepare(
      "SELECT cs.summary FROM chapter_summaries cs JOIN chapters c ON c.id = cs.chapter_id WHERE c.project_id = ? ORDER BY datetime(c.updated_at) DESC LIMIT 5"
    )
    .all(projectId);
  const outlineText = String(projectConfig.outline_text || "").trim().slice(0, 6000);
  const summariesText =
    summaries.length > 0 ? summaries.map((item, idx) => `${idx + 1}. ${String(item.summary || "").trim()}`).join("\n") : "none";
  const contextBlock = [
    `Book Name: ${String(project?.name || "未命名作品").trim()}`,
    `Book Description: ${String(project?.description || "").trim() || "none"}`,
    `Synopsis: ${String(projectConfig.synopsis || "").trim() || "none"}`,
    `Writing Style: ${String(projectConfig.writing_style || "").trim() || "none"}`,
    `Narrative POV: ${String(projectConfig.narrative_pov || "").trim() || "none"}`,
    `Outline: ${outlineText || "none"}`,
    `Characters:\n${formatMemoryList(context.characters, "name", "profile")}`,
    `Locations:\n${formatMemoryList(context.locations, "name", "description")}`,
    `World Rules:\n${formatMemoryList(context.rules, "key_name", "value_text")}`,
    `Recent Summaries:\n${summariesText}`
  ].join("\n\n");

  const contextHash = crypto.createHash("sha256").update(contextBlock, "utf8").digest("hex");

  return {
    projectId,
    projectConfig,
    contextBlock,
    contextHash,
    snapshot: {
      hasOutline: Boolean(outlineText),
      characterCount: context.characters.length,
      locationCount: context.locations.length,
      ruleCount: context.rules.length,
      summaryCount: summaries.length
    }
  };
}

function getProjectMemoryStatus(projectId) {
  return (
    db
      .prepare(
        "SELECT project_id, context_hash, status, detail, source, checked_at, synced_at FROM project_memory_status WHERE project_id = ?"
      )
      .get(projectId) || null
  );
}

function saveProjectMemoryStatus(projectId, payload = {}) {
  const status = String(payload.status || "not_checked").trim() || "not_checked";
  const detail = String(payload.detail || "").trim();
  const source = String(payload.source || "").trim();
  const contextHash = String(payload.contextHash || "").trim();
  const syncedAt = payload.syncedAt ? String(payload.syncedAt) : null;

  db.prepare(
    "INSERT INTO project_memory_status (project_id, context_hash, status, detail, source, checked_at, synced_at) VALUES (?, ?, ?, ?, ?, datetime('now'), ?) ON CONFLICT(project_id) DO UPDATE SET context_hash = excluded.context_hash, status = excluded.status, detail = excluded.detail, source = excluded.source, checked_at = datetime('now'), synced_at = excluded.synced_at"
  ).run(projectId, contextHash, status, detail, source, syncedAt);

  return getProjectMemoryStatus(projectId);
}

async function runProjectMemoryCheck(projectId, reason = "check") {
  const snapshot = buildProjectMemorySnapshot(projectId);
  const aiConfig = resolveAiConfigForProject(snapshot.projectConfig);
  const nonce = crypto.randomBytes(8).toString("hex");
  const result = await verifyProjectMemoryReceipt(
    {
      reason,
      contextBlock: snapshot.contextBlock,
      contextHash: snapshot.contextHash,
      nonce
    },
    aiConfig
  );

  const oldStatus = getProjectMemoryStatus(projectId);
  const saved = saveProjectMemoryStatus(projectId, {
    contextHash: snapshot.contextHash,
    status: result.ok ? "ok" : "failed",
    detail: result.detail || "",
    source: result.source || "",
    syncedAt: result.ok ? new Date().toISOString() : oldStatus?.synced_at || null
  });

  return {
    ok: Boolean(result.ok),
    status: saved?.status || "failed",
    upToDate: Boolean(result.ok),
    contextHash: snapshot.contextHash,
    detail: saved?.detail || "",
    source: saved?.source || "",
    checkedAt: saved?.checked_at || null,
    syncedAt: saved?.synced_at || null,
    snapshot: snapshot.snapshot,
    receipt: result.receipt || null
  };
}

function createCheatSession(bookName = "") {
  const token = crypto.randomUUID();
  const safeBookName = String(bookName || "").trim();
  const result = db
    .prepare(
      "INSERT INTO cheat_mode_sessions (session_token, book_name, status, project_id, created_at, updated_at) VALUES (?, ?, 'active', NULL, datetime('now'), datetime('now'))"
    )
    .run(token, safeBookName);
  return db
    .prepare(
      "SELECT id, session_token, book_name, status, project_id, created_at, updated_at FROM cheat_mode_sessions WHERE id = ?"
    )
    .get(result.lastInsertRowid);
}

function getCheatSessionByToken(sessionToken) {
  return db
    .prepare(
      "SELECT id, session_token, book_name, status, project_id, created_at, updated_at FROM cheat_mode_sessions WHERE session_token = ?"
    )
    .get(String(sessionToken || "").trim());
}

function getCheatMessages(sessionId, limit = 120) {
  const rows = db
    .prepare(
      "SELECT id, session_id, role, content, source, created_at FROM cheat_mode_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(sessionId, Number(limit));
  return rows.reverse();
}

function saveCheatMessage(sessionId, role, content, source = "") {
  const result = db
    .prepare(
      "INSERT INTO cheat_mode_messages (session_id, role, content, source, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    )
    .run(sessionId, role, content, source);
  db.prepare("UPDATE cheat_mode_sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionId);
  return db
    .prepare("SELECT id, session_id, role, content, source, created_at FROM cheat_mode_messages WHERE id = ?")
    .get(result.lastInsertRowid);
}

function setCheatSessionCompleted(sessionId, projectId) {
  db.prepare(
    "UPDATE cheat_mode_sessions SET status = 'completed', project_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(projectId, sessionId);
  return db
    .prepare(
      "SELECT id, session_token, book_name, status, project_id, created_at, updated_at FROM cheat_mode_sessions WHERE id = ?"
    )
    .get(sessionId);
}

function applyGeneratedContextToProject(projectId, payload = {}) {
  const runReplace = db.transaction((pid, data) => {
    db.prepare("DELETE FROM characters WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM locations WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM world_settings WHERE project_id = ?").run(pid);

    const addCharacter = db.prepare("INSERT INTO characters (project_id, name, profile) VALUES (?, ?, ?)");
    const addLocation = db.prepare("INSERT INTO locations (project_id, name, description) VALUES (?, ?, ?)");
    const addRule = db.prepare("INSERT INTO world_settings (project_id, key_name, value_text) VALUES (?, ?, ?)");

    (data.characters || []).forEach((item) => {
      if (item.name) {
        addCharacter.run(pid, String(item.name).trim(), String(item.profile || "").trim());
      }
    });
    (data.locations || []).forEach((item) => {
      if (item.name) {
        addLocation.run(pid, String(item.name).trim(), String(item.description || "").trim());
      }
    });
    (data.rules || []).forEach((item) => {
      if (item.key_name) {
        addRule.run(pid, String(item.key_name).trim(), String(item.value_text || "").trim());
      }
    });
  });

  runReplace(projectId, payload);
}

function buildCheatTranscript(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => `${item.role === "assistant" ? "AI" : "用户"}: ${String(item.content || "").trim()}`)
    .join("\n");
}

function contextConfig(type) {
  if (type === "character") {
    return {
      table: "characters",
      fields: ["name", "profile"],
      required: "name"
    };
  }
  if (type === "location") {
    return {
      table: "locations",
      fields: ["name", "description"],
      required: "name"
    };
  }
  if (type === "rule") {
    return {
      table: "world_settings",
      fields: ["key_name", "value_text"],
      required: "key_name"
    };
  }
  return null;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/settings/ai", (req, res) => {
  const cfg = getAiConfig();
  res.json({
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    apiKey: getSetting("ai_api_key"),
    hasApiKey: Boolean(cfg.apiKey)
  });
});

app.put("/api/settings/ai", (req, res) => {
  const baseUrl = String(req.body?.baseUrl || "").trim();
  const model = String(req.body?.model || "").trim();
  const apiKey = String(req.body?.apiKey || "").trim();

  if (baseUrl) {
    setSetting("ai_base_url", baseUrl);
  }
  if (model) {
    setSetting("ai_model", model);
  }
  setSetting("ai_api_key", apiKey);

  const cfg = getAiConfig();
  res.json({
    ok: true,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    hasApiKey: Boolean(cfg.apiKey)
  });
});

app.post("/api/settings/ai/test", async (req, res) => {
  const payload = req.body || {};
  const cfg = normalizeAiConfig({
    apiKey: typeof payload.apiKey === "string" ? payload.apiKey.trim() : getSetting("ai_api_key"),
    baseUrl: typeof payload.baseUrl === "string" ? payload.baseUrl.trim() : getSetting("ai_base_url"),
    model: typeof payload.model === "string" ? payload.model.trim() : getSetting("ai_model")
  });

  try {
    const result = await testAiConnection(cfg);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/cheat-mode/sessions", (req, res) => {
  const bookName = String(req.body?.bookName || "").trim();
  const session = createCheatSession(bookName);
  res.status(201).json({
    sessionToken: session.session_token,
    bookName: session.book_name || "",
    status: session.status,
    projectId: session.project_id || null,
    createdAt: session.created_at
  });
});

app.get("/api/cheat-mode/sessions/:sessionToken", (req, res) => {
  const session = getCheatSessionByToken(req.params.sessionToken);
  if (!session) {
    return res.status(404).json({ error: "session not found" });
  }
  res.json({
    sessionToken: session.session_token,
    bookName: session.book_name || "",
    status: session.status,
    projectId: session.project_id || null,
    createdAt: session.created_at,
    updatedAt: session.updated_at
  });
});

app.get("/api/cheat-mode/sessions/:sessionToken/messages", (req, res) => {
  const session = getCheatSessionByToken(req.params.sessionToken);
  if (!session) {
    return res.status(404).json({ error: "session not found" });
  }
  res.json(getCheatMessages(session.id, 200));
});

app.post("/api/cheat-mode/sessions/:sessionToken/messages", async (req, res) => {
  const session = getCheatSessionByToken(req.params.sessionToken);
  if (!session) {
    return res.status(404).json({ error: "session not found" });
  }
  if (session.status !== "active") {
    return badRequest(res, "session already completed");
  }

  const message = String(req.body?.message || "").trim();
  if (!message) {
    return badRequest(res, "message is required");
  }

  saveCheatMessage(session.id, "user", message, "user");
  const history = getCheatMessages(session.id, 30);

  try {
    const guide = await generateCheatModeGuideReply(
      {
        bookName: session.book_name || "",
        history,
        userMessage: message
      },
      getAiConfig()
    );
    saveCheatMessage(session.id, "assistant", String(guide.reply || "").trim(), String(guide.source || "").trim());

    return res.json({
      ok: true,
      source: guide.source || "",
      messages: getCheatMessages(session.id, 200)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/cheat-mode/sessions/:sessionToken/finish", async (req, res) => {
  const session = getCheatSessionByToken(req.params.sessionToken);
  if (!session) {
    return res.status(404).json({ error: "session not found" });
  }
  if (session.status !== "active") {
    return badRequest(res, "session already completed");
  }

  const overrideName = String(req.body?.bookName || "").trim();
  const bookName = overrideName || String(session.book_name || "").trim() || "未命名作品";
  const messages = getCheatMessages(session.id, 240);
  const transcript = buildCheatTranscript(messages);
  if (!transcript) {
    return badRequest(res, "chat history is empty");
  }

  try {
    const generated = await generateOutlineAndContextFromInterview(
      {
        bookName,
        transcript
      },
      getAiConfig()
    );

    const createResult = db
      .prepare("INSERT INTO projects (name, description, cover_color, cover_image) VALUES (?, ?, ?, ?)")
      .run(bookName, "由开挂模式访谈自动生成", "#0f766e", "");
    const projectId = Number(createResult.lastInsertRowid);
    upsertProjectConfig(projectId, {});
    saveProjectOutline(projectId, String(generated.outline || "").trim());
    applyGeneratedContextToProject(projectId, generated);
    setCheatSessionCompleted(session.id, projectId);

    return res.json({
      ok: true,
      projectId,
      source: generated.source || "",
      outline: String(generated.outline || "").trim(),
      characters: db
        .prepare("SELECT id, name, profile FROM characters WHERE project_id = ? ORDER BY id DESC LIMIT 50")
        .all(projectId),
      locations: db
        .prepare("SELECT id, name, description FROM locations WHERE project_id = ? ORDER BY id DESC LIMIT 50")
        .all(projectId),
      rules: db
        .prepare("SELECT id, key_name, value_text FROM world_settings WHERE project_id = ? ORDER BY id DESC LIMIT 50")
        .all(projectId)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/bookshelf", (req, res) => {
  const rows = db
    .prepare(
      "SELECT p.id, p.name, p.description, p.cover_color, p.cover_image, p.created_at, COALESCE(MAX(c.updated_at), p.created_at) AS last_active_at, COUNT(c.id) AS chapter_count FROM projects p LEFT JOIN chapters c ON c.project_id = p.id GROUP BY p.id ORDER BY datetime(last_active_at) DESC, p.id DESC"
    )
    .all();
  res.json(rows);
});

app.get("/api/projects", (req, res) => {
  const rows = db
    .prepare("SELECT id, name, description, cover_color, cover_image, created_at FROM projects ORDER BY id DESC")
    .all();
  res.json(rows);
});

app.get("/api/projects/:projectId", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  const row = db
    .prepare("SELECT id, name, description, cover_color, cover_image, created_at FROM projects WHERE id = ?")
    .get(projectId);
  if (!row) {
    return res.status(404).json({ error: "project not found" });
  }
  res.json(row);
});

app.post("/api/projects", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const coverColor = normalizeColor(req.body?.coverColor);
  const coverImage = String(req.body?.coverImage || "").trim();
  if (!name) {
    return badRequest(res, "name is required");
  }

  const result = db.prepare("INSERT INTO projects (name, description, cover_color, cover_image) VALUES (?, ?, ?, ?)").run(
    name,
    description,
    coverColor,
    coverImage
  );
  const projectId = Number(result.lastInsertRowid);
  upsertProjectConfig(projectId, {});

  const row = db
    .prepare("SELECT id, name, description, cover_color, cover_image, created_at FROM projects WHERE id = ?")
    .get(projectId);
  res.status(201).json(row);
});

app.put("/api/projects/:projectId", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }

  const old = db
    .prepare("SELECT id, name, description, cover_color, cover_image, created_at FROM projects WHERE id = ?")
    .get(projectId);
  if (!old) {
    return res.status(404).json({ error: "project not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : old.name;
  const description =
    typeof req.body?.description === "string" ? req.body.description.trim() : old.description;
  const coverColor =
    typeof req.body?.coverColor === "string" ? normalizeColor(req.body.coverColor) : old.cover_color;
  const coverImage =
    typeof req.body?.coverImage === "string" ? req.body.coverImage.trim() : old.cover_image;

  if (!name) {
    return badRequest(res, "name is required");
  }

  db.prepare("UPDATE projects SET name = ?, description = ?, cover_color = ?, cover_image = ? WHERE id = ?").run(
    name,
    description,
    coverColor,
    coverImage,
    projectId
  );
  const row = db
    .prepare("SELECT id, name, description, cover_color, cover_image, created_at FROM projects WHERE id = ?")
    .get(projectId);
  res.json(row);
});

app.delete("/api/projects/:projectId", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  const chapterIds = db
    .prepare("SELECT id FROM chapters WHERE project_id = ?")
    .all(projectId)
    .map((item) => Number(item.id));

  const runDelete = db.transaction((pid, cids) => {
    const cheatSessionIds = db
      .prepare("SELECT id FROM cheat_mode_sessions WHERE project_id = ?")
      .all(pid)
      .map((item) => Number(item.id));

    if (cids.length > 0) {
      const placeholders = cids.map(() => "?").join(",");
      db.prepare(`DELETE FROM chapter_summaries WHERE chapter_id IN (${placeholders})`).run(...cids);
      db.prepare(`DELETE FROM generation_logs WHERE chapter_id IN (${placeholders})`).run(...cids);
    }
    if (cheatSessionIds.length > 0) {
      const placeholders = cheatSessionIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM cheat_mode_messages WHERE session_id IN (${placeholders})`).run(...cheatSessionIds);
      db.prepare(`DELETE FROM cheat_mode_sessions WHERE id IN (${placeholders})`).run(...cheatSessionIds);
    }
    db.prepare("DELETE FROM generation_logs WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM story_facts WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM project_chat_messages WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM project_memory_status WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM characters WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM locations WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM world_settings WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM chapters WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM project_configs WHERE project_id = ?").run(pid);
    db.prepare("DELETE FROM projects WHERE id = ?").run(pid);
  });

  runDelete(projectId, chapterIds);
  res.json({ ok: true, id: projectId });
});

app.get("/api/projects/:projectId/config", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }
  res.json(getProjectConfig(projectId));
});

app.put("/api/projects/:projectId/config", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }
  const updated = upsertProjectConfig(projectId, req.body || {});
  res.json(updated);
});

app.post("/api/projects/:projectId/ai/test", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  const current = getProjectConfig(projectId);
  const merged = {
    ...current,
    ai_base_url_override:
      typeof req.body?.ai_base_url_override === "string"
        ? req.body.ai_base_url_override.trim()
        : current.ai_base_url_override,
    ai_api_key_override:
      typeof req.body?.ai_api_key_override === "string"
        ? req.body.ai_api_key_override.trim()
        : current.ai_api_key_override,
    ai_model_override:
      typeof req.body?.ai_model_override === "string"
        ? req.body.ai_model_override.trim()
        : current.ai_model_override
  };

  try {
    const result = await testAiConnection(resolveAiConfigForProject(merged));
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/projects/:projectId/outline", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }
  res.json(getProjectOutline(projectId));
});

app.put("/api/projects/:projectId/outline", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }
  if (typeof req.body?.outlineText !== "string") {
    return badRequest(res, "outlineText is required");
  }
  const updated = saveProjectOutline(projectId, req.body.outlineText);
  res.json(updated);
});

app.post("/api/projects/:projectId/outline/generate", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  const project = db.prepare("SELECT id, name, description FROM projects WHERE id = ?").get(projectId);
  const projectConfig = getProjectConfig(projectId);

  try {
    const result = await generateOutline(
      {
        name: project?.name || "",
        description: project?.description || "",
        synopsis: projectConfig.synopsis || "",
        writingStyle: projectConfig.writing_style || "",
        narrativePov: projectConfig.narrative_pov || "",
        existingOutline:
          typeof req.body?.existingOutline === "string" ? req.body.existingOutline : projectConfig.outline_text || "",
        promptHint: typeof req.body?.promptHint === "string" ? req.body.promptHint : ""
      },
      resolveAiConfigForProject(projectConfig)
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/outline/from-text", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  const novelText = typeof req.body?.novelText === "string" ? req.body.novelText : "";
  const promptHint = typeof req.body?.promptHint === "string" ? req.body.promptHint : "";

  if (!String(novelText || "").trim()) {
    return badRequest(res, "novelText is required");
  }

  const projectConfig = getProjectConfig(projectId);
  try {
    const result = await generateOutlineFromNovelText(
      {
        novelText,
        promptHint
      },
      resolveAiConfigForProject(projectConfig)
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/outline/from-text/context", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  const novelText = typeof req.body?.novelText === "string" ? req.body.novelText : "";
  const promptHint = typeof req.body?.promptHint === "string" ? req.body.promptHint : "";
  if (!String(novelText || "").trim()) {
    return badRequest(res, "novelText is required");
  }

  const projectConfig = getProjectConfig(projectId);
  try {
    const result = await extractContextFromNovelText(
      {
        novelText,
        promptHint
      },
      resolveAiConfigForProject(projectConfig)
    );

    const runReplace = db.transaction((pid, payload) => {
      db.prepare("DELETE FROM characters WHERE project_id = ?").run(pid);
      db.prepare("DELETE FROM locations WHERE project_id = ?").run(pid);
      db.prepare("DELETE FROM world_settings WHERE project_id = ?").run(pid);

      const addCharacter = db.prepare("INSERT INTO characters (project_id, name, profile) VALUES (?, ?, ?)");
      const addLocation = db.prepare("INSERT INTO locations (project_id, name, description) VALUES (?, ?, ?)");
      const addRule = db.prepare("INSERT INTO world_settings (project_id, key_name, value_text) VALUES (?, ?, ?)");

      (payload.characters || []).forEach((item) => {
        if (item.name) {
          addCharacter.run(pid, item.name, item.profile || "");
        }
      });
      (payload.locations || []).forEach((item) => {
        if (item.name) {
          addLocation.run(pid, item.name, item.description || "");
        }
      });
      (payload.rules || []).forEach((item) => {
        if (item.key_name) {
          addRule.run(pid, item.key_name, item.value_text || "");
        }
      });
    });

    runReplace(projectId, result);

    const context = {
      characters: db
        .prepare("SELECT id, name, profile FROM characters WHERE project_id = ? ORDER BY id DESC LIMIT 50")
        .all(projectId),
      locations: db
        .prepare("SELECT id, name, description FROM locations WHERE project_id = ? ORDER BY id DESC LIMIT 50")
        .all(projectId),
      rules: db
        .prepare("SELECT id, key_name, value_text FROM world_settings WHERE project_id = ? ORDER BY id DESC LIMIT 50")
        .all(projectId)
    };

    res.json({
      ok: true,
      source: result.source,
      ...context
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/outline/upload", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  const current = getProjectOutline(projectId);
  const outlineText =
    typeof req.body?.outlineText === "string" ? req.body.outlineText : current.outline_text || "";
  if (!String(outlineText || "").trim()) {
    return badRequest(res, "outline text is empty");
  }

  const uploaded = uploadProjectOutline(projectId, outlineText);
  res.json(uploaded);
});

app.get("/api/projects/:projectId/chapters", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }

  const rows = db
    .prepare(
      "SELECT id, project_id, title, content, sort_order, updated_at FROM chapters WHERE project_id = ? ORDER BY sort_order ASC, id ASC"
    )
    .all(projectId);
  res.json(rows);
});

app.post("/api/projects/:projectId/chapters", (req, res) => {
  const projectId = Number(req.params.projectId);
  const title = String(req.body?.title || "").trim() || "Untitled Chapter";
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }

  const maxOrderRow = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM chapters WHERE project_id = ?")
    .get(projectId);
  const nextOrder = Number(maxOrderRow?.maxOrder || 0) + 1;

  const result = db
    .prepare("INSERT INTO chapters (project_id, title, content, sort_order, updated_at) VALUES (?, ?, '', ?, datetime('now'))")
    .run(projectId, title, nextOrder);
  const row = db.prepare("SELECT * FROM chapters WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(row);
});

app.put("/api/chapters/:chapterId", (req, res) => {
  const chapterId = Number(req.params.chapterId);
  if (!chapterId) {
    return badRequest(res, "invalid chapterId");
  }

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : undefined;
  const content = typeof req.body?.content === "string" ? req.body.content : undefined;
  const old = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId);
  if (!old) {
    return res.status(404).json({ error: "chapter not found" });
  }

  const newTitle = title === undefined || title === "" ? old.title : title;
  const newContent = content === undefined ? old.content : content;
  db.prepare("UPDATE chapters SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?").run(
    newTitle,
    newContent,
    chapterId
  );

  const row = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId);
  res.json(row);
});

app.delete("/api/chapters/:chapterId", (req, res) => {
  const chapterId = Number(req.params.chapterId);
  if (!chapterId) {
    return badRequest(res, "invalid chapterId");
  }

  const chapter = db.prepare("SELECT id, project_id FROM chapters WHERE id = ?").get(chapterId);
  if (!chapter) {
    return res.status(404).json({ error: "chapter not found" });
  }

  const runDelete = db.transaction((cid) => {
    db.prepare("DELETE FROM chapter_summaries WHERE chapter_id = ?").run(cid);
    db.prepare("DELETE FROM generation_logs WHERE chapter_id = ?").run(cid);
    db.prepare("DELETE FROM story_facts WHERE chapter_id = ?").run(cid);
    db.prepare("DELETE FROM chapters WHERE id = ?").run(cid);
  });

  runDelete(chapterId);
  res.json({ ok: true, id: chapterId, projectId: chapter.project_id });
});

app.delete("/api/chapters/:chapterId/summary", (req, res) => {
  const chapterId = Number(req.params.chapterId);
  if (!chapterId) {
    return badRequest(res, "invalid chapterId");
  }

  const result = db.prepare("DELETE FROM chapter_summaries WHERE chapter_id = ?").run(chapterId);
  if (result.changes === 0) {
    return res.status(404).json({ error: "summary not found" });
  }

  res.json({ ok: true, chapter_id: chapterId });
});

app.get("/api/projects/:projectId/facts", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  res.json(getStoryFacts(projectId, 50));
});

app.post("/api/projects/:projectId/facts/extract", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  const chapterId = Number(req.body?.chapterId);
  if (!chapterId) {
    return badRequest(res, "chapterId is required");
  }

  const chapter = db.prepare("SELECT id, content FROM chapters WHERE id = ? AND project_id = ?").get(chapterId, projectId);
  if (!chapter) {
    return res.status(404).json({ error: "chapter not found" });
  }

  if (!String(chapter.content || "").trim()) {
    return badRequest(res, "chapter content is empty");
  }

  try {
    const projectConfig = getProjectConfig(projectId);
    const aiConfig = resolveAiConfigForProject(projectConfig);
    const facts = await extractStoryFacts(chapter.content, aiConfig);

    const runSave = db.transaction((rows) => {
      db.prepare("DELETE FROM story_facts WHERE project_id = ? AND chapter_id = ?").run(projectId, chapterId);
      const stmt = db.prepare(
        "INSERT INTO story_facts (project_id, chapter_id, fact_text, created_at) VALUES (?, ?, ?, datetime('now'))"
      );
      rows.forEach((factText) => {
        stmt.run(projectId, chapterId, factText);
      });
    });

    runSave(facts);

    res.json({
      ok: true,
      chapterId,
      count: facts.length,
      facts: getStoryFacts(projectId, 50)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/projects/:projectId/facts/:factId", (req, res) => {
  const projectId = Number(req.params.projectId);
  const factId = Number(req.params.factId);
  if (!projectId || !factId) {
    return badRequest(res, "invalid projectId or factId");
  }

  const result = db.prepare("DELETE FROM story_facts WHERE id = ? AND project_id = ?").run(factId, projectId);
  if (result.changes === 0) {
    return res.status(404).json({ error: "fact not found" });
  }

  res.json({ ok: true, id: factId });
});

app.delete("/api/projects/:projectId/logs", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }

  db.prepare("DELETE FROM generation_logs WHERE project_id = ?").run(projectId);
  res.json({ ok: true, projectId });
});

app.delete("/api/projects/:projectId/logs/:logId", (req, res) => {
  const projectId = Number(req.params.projectId);
  const logId = Number(req.params.logId);
  if (!projectId || !logId) {
    return badRequest(res, "invalid projectId or logId");
  }

  const result = db.prepare("DELETE FROM generation_logs WHERE id = ? AND project_id = ?").run(logId, projectId);
  if (result.changes === 0) {
    return res.status(404).json({ error: "log not found" });
  }

  res.json({ ok: true, id: logId });
});

app.get("/api/projects/:projectId/logs", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }

  const rows = db
    .prepare(
      "SELECT id, chapter_id, action, output_text, created_at FROM generation_logs WHERE project_id = ? ORDER BY id DESC LIMIT 30"
    )
    .all(projectId);
  res.json(rows);
});

app.get("/api/projects/:projectId/chat/messages", (req, res) => {
  const projectId = Number(req.params.projectId);
  const limit = Number(req.query?.limit || 80);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }
  res.json(getProjectChatMessages(projectId, Math.max(1, Math.min(limit, 200))));
});

app.post("/api/projects/:projectId/chat/messages", async (req, res) => {
  const projectId = Number(req.params.projectId);
  const message = String(req.body?.message || "").trim();
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }
  if (!message) {
    return badRequest(res, "message is required");
  }

  const project = db.prepare("SELECT id, name, description FROM projects WHERE id = ?").get(projectId);
  const projectConfig = getProjectConfig(projectId);
  const context = {
    characters: db
      .prepare("SELECT name, profile FROM characters WHERE project_id = ? ORDER BY id DESC LIMIT 30")
      .all(projectId),
    locations: db
      .prepare("SELECT name, description FROM locations WHERE project_id = ? ORDER BY id DESC LIMIT 30")
      .all(projectId),
    rules: db
      .prepare("SELECT key_name, value_text FROM world_settings WHERE project_id = ? ORDER BY id DESC LIMIT 30")
      .all(projectId)
  };
  const history = getProjectChatMessages(projectId, 20);

  const insertMessage = db.prepare(
    "INSERT INTO project_chat_messages (project_id, role, content, source, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  );
  const userInsert = insertMessage.run(projectId, "user", message, "user");
  const userMessageRow = db
    .prepare("SELECT id, project_id, role, content, source, created_at FROM project_chat_messages WHERE id = ?")
    .get(userInsert.lastInsertRowid);

  try {
    const aiConfig = resolveAiConfigForProject(projectConfig);
    const chatResult = await generateProjectChatReply(
      {
        projectName: project?.name || "",
        projectDescription: project?.description || "",
        projectConfig: {},
        outlineText: projectConfig.outline_text || "",
        characters: context.characters,
        locations: context.locations,
        rules: context.rules,
        recentMessages: history,
        userMessage: message
      },
      aiConfig
    );

    const assistantInsert = insertMessage.run(
      projectId,
      "assistant",
      String(chatResult.reply || "").trim(),
      String(chatResult.source || "").trim()
    );
    const assistantMessageRow = db
      .prepare("SELECT id, project_id, role, content, source, created_at FROM project_chat_messages WHERE id = ?")
      .get(assistantInsert.lastInsertRowid);

    return res.json({
      ok: true,
      source: chatResult.source,
      userMessage: userMessageRow,
      assistantMessage: assistantMessageRow,
      messages: getProjectChatMessages(projectId, 80)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete("/api/projects/:projectId/chat/messages", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }
  db.prepare("DELETE FROM project_chat_messages WHERE project_id = ?").run(projectId);
  res.json({ ok: true, projectId });
});

app.get("/api/projects/:projectId/memory/status", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  const snapshot = buildProjectMemorySnapshot(projectId);
  const statusRow = getProjectMemoryStatus(projectId);
  const upToDate = Boolean(
    statusRow && statusRow.status === "ok" && String(statusRow.context_hash || "") === snapshot.contextHash
  );

  let status = "not_checked";
  let detail = "尚未检查上下文是否被 AI 正确读取";
  if (statusRow) {
    const stale = String(statusRow.context_hash || "") !== snapshot.contextHash;
    status = stale ? "stale" : String(statusRow.status || "not_checked");
    detail = stale
      ? "上下文已变化，需重新发送上下文"
      : String(statusRow.detail || "最近一次校验已完成");
  }

  res.json({
    status,
    upToDate,
    contextHash: snapshot.contextHash,
    checkedAt: statusRow?.checked_at || null,
    syncedAt: statusRow?.synced_at || null,
    source: statusRow?.source || "",
    detail,
    injectionSources: ["outline", "settings", "recent_summaries"],
    snapshot: snapshot.snapshot
  });
});

app.post("/api/projects/:projectId/memory/check", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  try {
    const result = await runProjectMemoryCheck(projectId, "check");
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/memory/resend", async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  try {
    const result = await runProjectMemoryCheck(projectId, "resend");
    res.json({
      ...result,
      action: "resend"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/projects/:projectId/context", (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }

  const characters = db
    .prepare("SELECT id, name, profile FROM characters WHERE project_id = ? ORDER BY id DESC LIMIT 50")
    .all(projectId);
  const locations = db
    .prepare("SELECT id, name, description FROM locations WHERE project_id = ? ORDER BY id DESC LIMIT 50")
    .all(projectId);
  const rules = db
    .prepare("SELECT id, key_name, value_text FROM world_settings WHERE project_id = ? ORDER BY id DESC LIMIT 50")
    .all(projectId);

  res.json({ characters, locations, rules });
});

app.post("/api/projects/:projectId/context/:type", (req, res) => {
  const projectId = Number(req.params.projectId);
  const type = req.params.type;
  if (!projectId) {
    return badRequest(res, "invalid projectId");
  }

  const config = contextConfig(type);
  if (!config) {
    return badRequest(res, "type must be one of: character, location, rule");
  }

  const firstField = config.fields[0];
  const secondField = config.fields[1];
  const firstValue = String(req.body?.[firstField] || "").trim();
  const secondValue = String(req.body?.[secondField] || "").trim();
  if (!firstValue) {
    return badRequest(res, `${config.required} is required`);
  }

  const result = db
    .prepare(`INSERT INTO ${config.table} (project_id, ${firstField}, ${secondField}) VALUES (?, ?, ?)`)
    .run(projectId, firstValue, secondValue);
  const row = db
    .prepare(`SELECT id, ${firstField}, ${secondField} FROM ${config.table} WHERE id = ?`)
    .get(result.lastInsertRowid);
  return res.status(201).json(row);
});

app.delete("/api/projects/:projectId/context/:type/:itemId", (req, res) => {
  const projectId = Number(req.params.projectId);
  const itemId = Number(req.params.itemId);
  const type = req.params.type;
  if (!projectId || !itemId) {
    return badRequest(res, "invalid projectId or itemId");
  }

  const config = contextConfig(type);
  if (!config) {
    return badRequest(res, "type must be one of: character, location, rule");
  }

  const result = db
    .prepare(`DELETE FROM ${config.table} WHERE id = ? AND project_id = ?`)
    .run(itemId, projectId);
  if (result.changes === 0) {
    return res.status(404).json({ error: "context item not found" });
  }

  res.json({ ok: true, type, id: itemId });
});

app.get("/api/chapters/:chapterId/summary", (req, res) => {
  const chapterId = Number(req.params.chapterId);
  if (!chapterId) {
    return badRequest(res, "invalid chapterId");
  }

  const row = db
    .prepare("SELECT chapter_id, summary, updated_at FROM chapter_summaries WHERE chapter_id = ?")
    .get(chapterId);
  if (!row) {
    return res.status(404).json({ error: "summary not found" });
  }
  res.json(row);
});

app.post("/api/chapters/:chapterId/summarize", async (req, res) => {
  const chapterId = Number(req.params.chapterId);
  if (!chapterId) {
    return badRequest(res, "invalid chapterId");
  }

  const chapter = db.prepare("SELECT id, project_id, content FROM chapters WHERE id = ?").get(chapterId);
  if (!chapter) {
    return res.status(404).json({ error: "chapter not found" });
  }
  if (!String(chapter.content || "").trim()) {
    return badRequest(res, "chapter content is empty");
  }

  try {
    const projectConfig = getProjectConfig(Number(chapter.project_id));
    const summary = await summarizeChapter(chapter.content, resolveAiConfigForProject(projectConfig));
    db.prepare(
      "INSERT INTO chapter_summaries (chapter_id, summary, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(chapter_id) DO UPDATE SET summary = excluded.summary, updated_at = datetime('now')"
    ).run(chapterId, summary);

    const saved = db.prepare("SELECT chapter_id, summary, updated_at FROM chapter_summaries WHERE chapter_id = ?").get(chapterId);
    res.json(saved);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/projects/:projectId/ai/compose", async (req, res) => {
  const projectId = Number(req.params.projectId);
  const chapterId = Number(req.body?.chapterId);
  const action = String(req.body?.action || "continue").trim();
  const selectedText = String(req.body?.selectedText || "").trim();
  const instruction = String(req.body?.instruction || "").trim();
  if (!projectId || !chapterId) {
    return badRequest(res, "projectId and chapterId are required");
  }
  if (!projectExists(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ? AND project_id = ?").get(chapterId, projectId);
  if (!chapter) {
    return res.status(404).json({ error: "chapter not found" });
  }

  const projectConfig = getProjectConfig(projectId);
  const outlineForAi = String(projectConfig.outline_text || "").trim();
  const tone = String(req.body?.tone || "").trim() || projectConfig.default_tone;
  const targetLength = String(req.body?.targetLength || "").trim() || projectConfig.default_target_length;
  const characterCards = db
    .prepare("SELECT name, profile FROM characters WHERE project_id = ? ORDER BY id DESC LIMIT 20")
    .all(projectId);
  const locationCards = db
    .prepare("SELECT name, description FROM locations WHERE project_id = ? ORDER BY id DESC LIMIT 20")
    .all(projectId);
  const worldRules = db
    .prepare("SELECT key_name, value_text FROM world_settings WHERE project_id = ? ORDER BY id DESC LIMIT 20")
    .all(projectId);
  const chatHistory = getProjectChatMessages(projectId, 20).map((item) => ({
    role: item.role,
    content: item.content
  }));

  const insertMessage = db.prepare(
    "INSERT INTO project_chat_messages (project_id, role, content, source, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  );
  if (instruction) {
    insertMessage.run(projectId, "user", instruction, "user");
  }

  try {
    const aiConfig = resolveAiConfigForProject(projectConfig);
    const generated = await generateNovelText(
      {
        action,
        chapterContent: chapter.content || "",
        selectedText,
        userInstruction: instruction,
        chatHistory,
        summaries: [],
        characterCards,
        locationCards,
        worldRules,
        storyFacts: [],
        tone,
        targetLength,
        projectConfig: {
          outline_for_ai: outlineForAi
        }
      },
      aiConfig
    );

    db.prepare(
      "INSERT INTO generation_logs (project_id, chapter_id, action, prompt_text, output_text) VALUES (?, ?, ?, ?, ?)"
    ).run(projectId, chapterId, `compose:${action}`, generated.promptText, generated.output);

    insertMessage.run(projectId, "assistant", generated.output, String(generated.source || ""));

    res.json({
      output: generated.output,
      source: generated.source,
      messages: getProjectChatMessages(projectId, 80)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ai/action", async (req, res) => {
  const projectId = Number(req.body?.projectId);
  const chapterId = Number(req.body?.chapterId);
  const action = String(req.body?.action || "continue").trim();
  if (!projectId || !chapterId) {
    return badRequest(res, "projectId and chapterId are required");
  }

  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ? AND project_id = ?").get(chapterId, projectId);
  if (!chapter) {
    return res.status(404).json({ error: "chapter not found" });
  }

  const projectConfig = getProjectConfig(projectId);
  const outlineForAi =
    Number(projectConfig.outline_uploaded || 0) === 1 ? String(projectConfig.outline_text || "") : "";
  const selectedText = String(req.body?.selectedText || "").trim();
  const tone = String(req.body?.tone || "").trim() || projectConfig.default_tone;
  const targetLength = String(req.body?.targetLength || "").trim() || projectConfig.default_target_length;

  const summaries = db
    .prepare(
      "SELECT cs.summary FROM chapter_summaries cs JOIN chapters c ON c.id = cs.chapter_id WHERE c.project_id = ? ORDER BY c.updated_at DESC LIMIT 3"
    )
    .all(projectId);
  const characterCards = db
    .prepare("SELECT name, profile FROM characters WHERE project_id = ? ORDER BY id DESC LIMIT 12")
    .all(projectId);
  const locationCards = db
    .prepare("SELECT name, description FROM locations WHERE project_id = ? ORDER BY id DESC LIMIT 12")
    .all(projectId);
  const worldRules = db
    .prepare("SELECT key_name, value_text FROM world_settings WHERE project_id = ? ORDER BY id DESC LIMIT 12")
    .all(projectId);
  const storyFacts = db
    .prepare("SELECT fact_text FROM story_facts WHERE project_id = ? ORDER BY id DESC LIMIT 24")
    .all(projectId);

  try {
    const aiConfig = resolveAiConfigForProject(projectConfig);

    const generated = await generateNovelText(
      {
        action,
        chapterContent: chapter.content || "",
        selectedText,
        summaries,
        characterCards,
        locationCards,
        worldRules,
        storyFacts,
        tone,
        targetLength,
        projectConfig: {
          ...projectConfig,
          outline_for_ai: outlineForAi
        }
      },
      aiConfig
    );

    db.prepare(
      "INSERT INTO generation_logs (project_id, chapter_id, action, prompt_text, output_text) VALUES (?, ?, ?, ?, ?)"
    ).run(projectId, chapterId, action, generated.promptText, generated.output);

    res.json({
      candidates: [generated.output],
      source: generated.source
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: `api route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

function startServer(listenPort = port) {
  if (serverInstance) {
    return Promise.resolve(serverInstance);
  }

  return new Promise((resolve, reject) => {
    const candidate = app.listen(listenPort);
    const onError = (error) => {
      candidate.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      candidate.removeListener("error", onError);
      serverInstance = candidate;
      resolve(candidate);
    };
    candidate.once("error", onError);
    candidate.once("listening", onListening);
  });
}

function stopServer() {
  return new Promise((resolve, reject) => {
    if (!serverInstance) {
      resolve();
      return;
    }
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      serverInstance = null;
      resolve();
    });
  });
}

if (require.main === module) {
  startServer()
    .then(() => {
      console.log(`Demo server is running on http://localhost:${port}`);
    })
    .catch((error) => {
      console.error(`Failed to start server: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  app,
  startServer,
  stopServer,
  port
};














