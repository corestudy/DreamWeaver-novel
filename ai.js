function normalizeAiConfig(config = {}) {
  return {
    apiKey: String(config.apiKey || process.env.AI_API_KEY || "").trim(),
    baseUrl: String(config.baseUrl || process.env.AI_BASE_URL || "https://api.openai.com/v1").trim(),
    model: String(config.model || process.env.AI_MODEL || "gpt-4o-mini").trim()
  };
}

function buildPrompt(payload) {
  const {
    action,
    chapterContent,
    selectedText,
    userInstruction,
    chatHistory,
    summaries,
    characterCards,
    locationCards,
    worldRules,
    storyFacts,
    tone,
    targetLength,
    projectConfig
  } = payload;

  const summaryText =
    summaries.length > 0 ? summaries.map((item, idx) => `${idx + 1}. ${item.summary}`).join("\n") : "none";
  const charactersText =
    characterCards.length > 0 ? characterCards.map((item) => `- ${item.name}: ${item.profile}`).join("\n") : "none";
  const locationsText =
    locationCards.length > 0
      ? locationCards.map((item) => `- ${item.name}: ${item.description}`).join("\n")
      : "none";
  const rulesText =
    worldRules.length > 0 ? worldRules.map((item) => `- ${item.key_name}: ${item.value_text}`).join("\n") : "none";
  const factsText =
    storyFacts.length > 0 ? storyFacts.map((item, idx) => `${idx + 1}. ${item.fact_text}`).join("\n") : "none";
  const chatHistoryText =
    Array.isArray(chatHistory) && chatHistory.length > 0
      ? chatHistory
          .map((item) => `${item.role === "assistant" ? "AI" : "用户"}: ${String(item.content || "").trim()}`)
          .join("\n")
      : "none";
  const instructionText = String(userInstruction || "").trim() || "none";

  const actionText = selectedText
    ? `Selected text:\n${selectedText}`
    : `Current chapter excerpt:\n${String(chapterContent || "").slice(-1200)}`;

  const outlineForAi = String(projectConfig?.outline_for_ai || "").trim();
  const projectConfigText = projectConfig
    ? [
        `Synopsis: ${projectConfig.synopsis || "none"}`,
        `Writing style: ${projectConfig.writing_style || "none"}`,
        `Narrative POV: ${projectConfig.narrative_pov || "none"}`,
        `Outline for AI: ${outlineForAi ? outlineForAi.slice(0, 3000) : "none"}`
      ].join("\n")
    : "none";

  const system =
    "You are a novel writing assistant. Keep style and character consistency. Output only prose in Chinese.";
  const user = [
    `Task type: ${action}`,
    `Tone: ${tone || "natural narrative"}`,
    `Length target: ${targetLength || "about 200-500 Chinese characters"}`,
    `Book configuration:\n${projectConfigText}`,
    `Recent chapter summaries:\n${summaryText}`,
    `Character cards:\n${charactersText}`,
    `Location cards:\n${locationsText}`,
    `World rules:\n${rulesText}`,
    `Continuity facts:\n${factsText}`,
    `Book chat history:\n${chatHistoryText}`,
    `Current user instruction:\n${instructionText}`,
    actionText,
    "Output requirement: only the final prose text, no explanation."
  ].join("\n\n");

  return { system, user };
}

async function requestWithOpenAICompatible(messages, aiConfig) {
  const cfg = normalizeAiConfig(aiConfig);
  if (!cfg.apiKey) {
    return null;
  }

  const endpoint = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: 0.85
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

function mockText(action, chapterContent, selectedText, userInstruction = "") {
  const seed = selectedText || String(chapterContent || "").slice(-300) || "夜色落在窗沿，故事还没结束。";
  const instructionSeed = String(userInstruction || "").trim();
  const templates = {
    write: `她在雨停后的街口站了很久，直到路灯一盏盏亮起。\n${
      instructionSeed || seed
    }\n风从巷尾灌进来，像一只看不见的手，把所有迟疑都推向了下一步。`,
    continue: `他把门轻轻推开，空气里有股潮湿的铁锈味。\n${seed}\n下一刻，走廊尽头传来脚步声，像有人在黑暗里数着他们的呼吸。`,
    rewrite: `她把情绪压进喉咙，只留下一句平静的回答。\n${seed}\n房间安静得过分，连钟摆声都像在提醒她，已经没有退路。`,
    polish: `雨丝斜斜落下，玻璃上映出她迟疑的影子。\n${seed}\n她知道，真正的选择从来不是“要不要”，而是“承不承担后果”。`,
    expand: `夜车穿过空旷站台时，广播正在播报最后一班列车。\n${seed}\n他抬头看见广告牌闪烁，旧城的霓虹像一层薄雾，把所有人的秘密都涂成同一种颜色。`
  };
  return templates[action] || templates.continue;
}

async function generateNovelText(payload, aiConfig = {}) {
  const cfg = normalizeAiConfig(aiConfig);
  const prompt = buildPrompt(payload);
  const messages = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user }
  ];

  try {
    const apiText = await requestWithOpenAICompatible(messages, cfg);
    if (apiText) {
      return {
        output: apiText,
        promptText: `${prompt.system}\n\n${prompt.user}`,
        source: `api:${cfg.model}`
      };
    }
  } catch (error) {
    return {
      output: mockText(payload.action, payload.chapterContent, payload.selectedText, payload.userInstruction),
      promptText: `${prompt.system}\n\n${prompt.user}`,
      source: `mock(fallback:${error.message})`
    };
  }

  return {
    output: mockText(payload.action, payload.chapterContent, payload.selectedText, payload.userInstruction),
    promptText: `${prompt.system}\n\n${prompt.user}`,
    source: "mock(no_api_key)"
  };
}

async function summarizeChapter(content, aiConfig = {}) {
  const messages = [
    {
      role: "system",
      content: "You are a fiction editor. Summarize this chapter in Chinese within 120 characters."
    },
    {
      role: "user",
      content: `Summarize the chapter:\n${String(content || "").slice(0, 4000)}`
    }
  ];

  try {
    const text = await requestWithOpenAICompatible(messages, aiConfig);
    if (text) {
      return text;
    }
  } catch {
    return `本章主要内容：${String(content || "").slice(0, 100).replace(/\s+/g, " ")}...`;
  }

  return `本章主要内容：${String(content || "").slice(0, 100).replace(/\s+/g, " ")}...`;
}

async function extractStoryFacts(content, aiConfig = {}) {
  const clipped = String(content || "").slice(0, 6000);
  const messages = [
    {
      role: "system",
      content:
        "你是小说连续性编辑。请从文本提取 3-8 条关键事实，保持可被后续章节复用。只输出 JSON 数组字符串，例如 [\"事实1\",\"事实2\"]。"
    },
    {
      role: "user",
      content: `请提取关键事实：\n${clipped}`
    }
  ];

  try {
    const text = await requestWithOpenAICompatible(messages, aiConfig);
    if (text) {
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 12);
        }
      }
    }
  } catch {
    // fallback below
  }

  return String(content || "")
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => s.slice(0, 70));
}

function mockOutline(payload = {}) {
  const name = String(payload.name || "未命名小说").trim() || "未命名小说";
  const description = String(payload.description || "").trim();
  const theme = description || "成长、秘密与选择";

  return [
    `# 《${name}》大纲`,
    "",
    "## 一、故事主线",
    `- 核心主题：${theme}`,
    "- 主角在一次意外后卷入更大的冲突，必须在个人欲望与责任之间做选择。",
    "",
    "## 二、角色关系",
    "- 主角：拥有目标但心存顾虑，推动主线前进。",
    "- 搭档：在关键节点提供帮助，也带来价值观碰撞。",
    "- 对立者：与主角目标冲突，制造主要阻力。",
    "",
    "## 三、三幕结构",
    "### 第一幕：引子与触发",
    "- 介绍主角日常与缺口。",
    "- 触发事件发生，主角被迫行动。",
    "### 第二幕：升级与反转",
    "- 主角不断接近真相，代价逐渐增大。",
    "- 中段出现重大反转，关系重组。",
    "### 第三幕：决战与收束",
    "- 主角完成最终抉择并承担后果。",
    "- 主线收束，同时保留后续伏笔。",
    "",
    "## 四、章节推进建议",
    "- 第 1-3 章：快速建立世界观与人物目标。",
    "- 第 4-8 章：冲突持续升级，加入阶段性胜利与失败。",
    "- 第 9 章后：集中收线，强化情感与主题落点。"
  ].join("\n");
}

async function generateOutline(payload = {}, aiConfig = {}) {
  const cfg = normalizeAiConfig(aiConfig);
  const name = String(payload.name || "").trim() || "未命名小说";
  const description = String(payload.description || "").trim() || "暂无简介";
  const synopsis = String(payload.synopsis || "").trim() || "暂无剧情摘要";
  const writingStyle = String(payload.writingStyle || "").trim() || "自然叙事";
  const narrativePov = String(payload.narrativePov || "").trim() || "第三人称";
  const existingOutline = String(payload.existingOutline || "").trim();
  const promptHint = String(payload.promptHint || "").trim();

  const messages = [
    {
      role: "system",
      content:
        "你是中文小说策划编辑。请输出结构化、可执行的大纲，格式为 Markdown，内容包含主线、角色关系、三幕结构与章节推进建议。"
    },
    {
      role: "user",
      content: [
        `作品名：${name}`,
        `作品简介：${description}`,
        `剧情摘要：${synopsis}`,
        `写作风格：${writingStyle}`,
        `叙事视角：${narrativePov}`,
        `已有大纲：${existingOutline || "无"}`,
        `额外要求：${promptHint || "无"}`,
        "请生成一版完整但精炼的大纲，直接输出 Markdown 正文。"
      ].join("\n")
    }
  ];

  try {
    const text = await requestWithOpenAICompatible(messages, cfg);
    if (text) {
      return {
        outline: text,
        source: `api:${cfg.model}`
      };
    }
  } catch (error) {
    return {
      outline: mockOutline(payload),
      source: `mock(fallback:${error.message})`
    };
  }

  return {
    outline: mockOutline(payload),
    source: "mock(no_api_key)"
  };
}

function mockOutlineFromNovelText(novelText, promptHint = "") {
  const preview = String(novelText || "").replace(/\s+/g, " ").slice(0, 200);
  return [
    "# 自动整理大纲（基于上传文本）",
    "",
    "## 一、故事概览",
    `- 文本预览：${preview || "（空）"}`,
    `- 补充要求：${promptHint || "无"}`,
    "",
    "## 二、主线推进（建议）",
    "- 开端：建立主角目标与初始冲突。",
    "- 中段：冲突升级，关系变化，揭示关键信息。",
    "- 结尾：完成关键抉择并给出结果。",
    "",
    "## 三、角色与关系（建议）",
    "- 主角：明确欲望、恐惧、成长弧线。",
    "- 配角：分别承担推动剧情、制造阻力、提供反差的角色功能。",
    "",
    "## 四、章节重排建议",
    "- 将原文按事件节点切分为 6-12 个章节。",
    "- 每章保留一个核心冲突和一个情绪落点。",
    "- 关键转折章节提前埋设至少 1 处伏笔。"
  ].join("\n");
}

async function generateOutlineFromNovelText(payload = {}, aiConfig = {}) {
  const cfg = normalizeAiConfig(aiConfig);
  const novelText = String(payload.novelText || "").trim();
  const promptHint = String(payload.promptHint || "").trim();

  if (!novelText) {
    throw new Error("novelText is required");
  }

  const clippedText = novelText.slice(0, 30000);
  const messages = [
    {
      role: "system",
      content:
        "你是资深中文小说编辑。请根据用户上传的小说正文，自动识别并整理出结构化大纲。输出 Markdown，包含：故事概览、主线推进、角色关系、三幕结构、章节建议。"
    },
    {
      role: "user",
      content: [
        `附加要求：${promptHint || "无"}`,
        "下面是小说正文片段，请据此整理大纲：",
        clippedText
      ].join("\n\n")
    }
  ];

  try {
    const text = await requestWithOpenAICompatible(messages, cfg);
    if (text) {
      return {
        outline: text,
        source: `api:${cfg.model}`
      };
    }
  } catch (error) {
    return {
      outline: mockOutlineFromNovelText(novelText, promptHint),
      source: `mock(fallback:${error.message})`
    };
  }

  return {
    outline: mockOutlineFromNovelText(novelText, promptHint),
    source: "mock(no_api_key)"
  };
}


function tryParseJsonObject(text) {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeContextResult(obj = {}) {
  const cleanList = (value) =>
    (Array.isArray(value) ? value : [])
      .map((item) => ({
        name: String(item?.name || "").trim(),
        profile: String(item?.profile || item?.description || "").trim(),
        description: String(item?.description || item?.profile || "").trim(),
        key_name: String(item?.key_name || item?.name || "").trim(),
        value_text: String(item?.value_text || item?.profile || item?.description || "").trim()
      }))
      .filter((item) => item.name || item.key_name || item.value_text)
      .slice(0, 20);

  const characters = cleanList(obj.characters)
    .filter((item) => item.name)
    .map((item) => ({ name: item.name, profile: item.profile }));
  const locations = cleanList(obj.locations)
    .filter((item) => item.name)
    .map((item) => ({ name: item.name, description: item.description }));
  const rules = cleanList(obj.rules)
    .filter((item) => item.key_name)
    .map((item) => ({ key_name: item.key_name, value_text: item.value_text }));

  return { characters, locations, rules };
}

async function extractContextFromNovelText(payload = {}, aiConfig = {}) {
  const cfg = normalizeAiConfig(aiConfig);
  const novelText = String(payload.novelText || "").trim();
  const promptHint = String(payload.promptHint || "").trim();

  if (!novelText) {
    throw new Error("novelText is required");
  }

  const clippedText = novelText.slice(0, 30000);
  const messages = [
    {
      role: "system",
      content:
        "你是中文小说设定编辑。请从给定正文中提取人物、地点、世界规则，并严格返回 JSON 对象：{\"characters\":[{\"name\":\"\",\"profile\":\"\"}],\"locations\":[{\"name\":\"\",\"description\":\"\"}],\"rules\":[{\"key_name\":\"\",\"value_text\":\"\"}]}。不要输出其他文本。"
    },
    {
      role: "user",
      content: [
        `附加要求：${promptHint || "无"}`,
        "请从以下小说正文提取设定资料：",
        clippedText
      ].join("\n\n")
    }
  ];

  try {
    const text = await requestWithOpenAICompatible(messages, cfg);
    if (text) {
      const parsed = tryParseJsonObject(text);
      if (parsed) {
        return {
          ...normalizeContextResult(parsed),
          source: `api:${cfg.model}`
        };
      }
    }
  } catch {
    // fallback below
  }

  return {
    characters: [],
    locations: [],
    rules: [],
    source: "mock(no_api_parse)"
  };
}

function formatChatContextBlock(payload = {}) {
  const projectName = String(payload.projectName || "未命名作品").trim();
  const projectDescription = String(payload.projectDescription || "").trim();
  const projectConfig = payload.projectConfig || {};
  const outlineText = String(payload.outlineText || "").trim().slice(0, 5000);
  const characters = Array.isArray(payload.characters) ? payload.characters : [];
  const locations = Array.isArray(payload.locations) ? payload.locations : [];
  const rules = Array.isArray(payload.rules) ? payload.rules : [];
  const summaries = Array.isArray(payload.summaries) ? payload.summaries : [];
  const facts = Array.isArray(payload.facts) ? payload.facts : [];

  const charactersText =
    characters.length > 0
      ? characters.map((item) => `- ${String(item.name || "").trim()}: ${String(item.profile || "").trim()}`).join("\n")
      : "none";
  const locationsText =
    locations.length > 0
      ? locations
          .map((item) => `- ${String(item.name || "").trim()}: ${String(item.description || "").trim()}`)
          .join("\n")
      : "none";
  const rulesText =
    rules.length > 0
      ? rules
          .map((item) => `- ${String(item.key_name || "").trim()}: ${String(item.value_text || "").trim()}`)
          .join("\n")
      : "none";
  const summariesText =
    summaries.length > 0
      ? summaries.map((item, idx) => `${idx + 1}. ${String(item.summary || "").trim()}`).join("\n")
      : "none";
  const factsText =
    facts.length > 0 ? facts.map((item, idx) => `${idx + 1}. ${String(item.fact_text || "").trim()}`).join("\n") : "none";

  return [
    `Book Name: ${projectName}`,
    `Book Description: ${projectDescription || "none"}`,
    `Synopsis: ${String(projectConfig.synopsis || "").trim() || "none"}`,
    `Writing Style: ${String(projectConfig.writing_style || "").trim() || "none"}`,
    `Narrative POV: ${String(projectConfig.narrative_pov || "").trim() || "none"}`,
    `Outline: ${outlineText || "none"}`,
    `Characters:\n${charactersText}`,
    `Locations:\n${locationsText}`,
    `World Rules:\n${rulesText}`,
    `Recent Summaries:\n${summariesText}`,
    `Continuity Facts:\n${factsText}`
  ].join("\n\n");
}

function mockChatReply(userMessage, projectName) {
  const clipped = String(userMessage || "").trim().slice(0, 120);
  return `已记录《${projectName || "本书"}》上下文。建议先锁定本章目标、冲突与情绪落点，再继续展开：${clipped}`;
}

async function generateProjectChatReply(payload = {}, aiConfig = {}) {
  const cfg = normalizeAiConfig(aiConfig);
  const userMessage = String(payload.userMessage || "").trim();
  const recentMessages = (Array.isArray(payload.recentMessages) ? payload.recentMessages : [])
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .slice(-20)
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").slice(0, 2000)
    }));

  if (!userMessage) {
    throw new Error("userMessage is required");
  }

  const contextBlock = formatChatContextBlock(payload);
  const messages = [
    {
      role: "system",
      content:
        "你是中文小说写作陪跑助手。你必须严格围绕当前书籍上下文给建议，保持人物设定、世界规则和剧情连贯。回答精炼、可执行。"
    },
    {
      role: "system",
      content: `以下是当前书籍上下文，请始终优先参考：\n\n${contextBlock}`
    },
    ...recentMessages,
    { role: "user", content: userMessage }
  ];

  try {
    const text = await requestWithOpenAICompatible(messages, cfg);
    if (text) {
      return {
        reply: text,
        source: `api:${cfg.model}`
      };
    }
  } catch (error) {
    return {
      reply: mockChatReply(userMessage, payload.projectName),
      source: `mock(fallback:${error.message})`
    };
  }

  return {
    reply: mockChatReply(userMessage, payload.projectName),
    source: "mock(no_api_key)"
  };
}

function mockCheatGuideReply(history = [], userMessage = "") {
  const turns = Array.isArray(history) ? history.length : 0;
  const clipped = String(userMessage || "").trim().slice(0, 120);
  if (turns < 2) {
    return `我们先定核心类型。你更想写哪类：都市、玄幻、科幻还是悬疑？${clipped ? `（你刚说：${clipped}）` : ""}`;
  }
  if (turns < 6) {
    return `很好。下一步请明确主角目标与最大阻碍：主角“最想得到什么”，以及“谁/什么在阻止他”？`;
  }
  return `信息已足够，我再补最后一个关键问题：这本书第一卷的终局事件是什么？回答后可点击“结束并生成”。`;
}

async function generateCheatModeGuideReply(payload = {}, aiConfig = {}) {
  const cfg = normalizeAiConfig(aiConfig);
  const bookName = String(payload.bookName || "未命名作品").trim();
  const userMessage = String(payload.userMessage || "").trim();
  const history = (Array.isArray(payload.history) ? payload.history : [])
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .slice(-20)
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").slice(0, 2000)
    }));

  if (!userMessage) {
    throw new Error("userMessage is required");
  }

  const messages = [
    {
      role: "system",
      content:
        "你是中文小说策划采访官。你的任务是通过连续提问帮用户补齐小说策划信息。每次回答先简短总结用户输入（1句），再提出1个最关键的下一问。禁止一次抛多个问题。"
    },
    {
      role: "system",
      content:
        "关键信息维度：题材、主角与目标、反派/阻碍、世界规则、主要角色关系、阶段冲突、第一卷终局。若信息不足，优先追问缺口。"
    },
    {
      role: "user",
      content: `当前作品名：${bookName}`
    },
    ...history,
    { role: "user", content: userMessage }
  ];

  try {
    const text = await requestWithOpenAICompatible(messages, cfg);
    if (text) {
      return {
        reply: text,
        source: `api:${cfg.model}`
      };
    }
  } catch (error) {
    return {
      reply: mockCheatGuideReply(history, userMessage),
      source: `mock(fallback:${error.message})`
    };
  }

  return {
    reply: mockCheatGuideReply(history, userMessage),
    source: "mock(no_api_key)"
  };
}

function normalizeInterviewResult(obj = {}) {
  const outline = String(obj.outline || "").trim();
  const normalized = normalizeContextResult(obj);
  return {
    outline,
    characters: normalized.characters,
    locations: normalized.locations,
    rules: normalized.rules
  };
}

function mockInterviewSummary(payload = {}) {
  const bookName = String(payload.bookName || "未命名作品").trim() || "未命名作品";
  const transcript = String(payload.transcript || "").trim().slice(0, 300);
  return {
    outline: [
      `# 《${bookName}》大纲`,
      "",
      "## 核心主线",
      "- 主角因一次关键事件被迫进入主冲突，并在利益与信念之间做选择。",
      "",
      "## 三幕推进",
      "- 第一幕：建立人物目标与触发事件。",
      "- 第二幕：冲突升级并揭示隐藏代价。",
      "- 第三幕：终局对抗与后果兑现。",
      "",
      "## 章节建议",
      "- 第1-3章：世界观与矛盾起点。",
      "- 第4-8章：关系变化与中段反转。",
      "- 第9章后：收束主线并铺垫后续。",
      "",
      "## 访谈摘要",
      transcript ? `- ${transcript}` : "- 用户暂未提供足够细节。"
    ].join("\n"),
    characters: [],
    locations: [],
    rules: []
  };
}

async function generateOutlineAndContextFromInterview(payload = {}, aiConfig = {}) {
  const cfg = normalizeAiConfig(aiConfig);
  const bookName = String(payload.bookName || "未命名作品").trim() || "未命名作品";
  const transcript = String(payload.transcript || "").trim();

  if (!transcript) {
    throw new Error("transcript is required");
  }

  const messages = [
    {
      role: "system",
      content:
        "你是中文小说主编。请根据访谈记录产出大纲与设定资料，并严格返回 JSON：{\"outline\":\"Markdown大纲\",\"characters\":[{\"name\":\"\",\"profile\":\"\"}],\"locations\":[{\"name\":\"\",\"description\":\"\"}],\"rules\":[{\"key_name\":\"\",\"value_text\":\"\"}]}。不要输出其他文本。"
    },
    {
      role: "user",
      content: [
        `作品名：${bookName}`,
        "请基于下面访谈记录生成结果：",
        transcript.slice(0, 24000)
      ].join("\n\n")
    }
  ];

  try {
    const text = await requestWithOpenAICompatible(messages, cfg);
    if (text) {
      const parsed = tryParseJsonObject(text);
      if (parsed) {
        const normalized = normalizeInterviewResult(parsed);
        if (normalized.outline) {
          return {
            ...normalized,
            source: `api:${cfg.model}`
          };
        }
      }
    }
  } catch (error) {
    const mock = mockInterviewSummary({ bookName, transcript });
    return {
      ...mock,
      source: `mock(fallback:${error.message})`
    };
  }

  const mock = mockInterviewSummary({ bookName, transcript });
  return {
    ...mock,
    source: "mock(no_api_key)"
  };
}

async function verifyProjectMemoryReceipt(payload = {}, aiConfig = {}) {
  const cfg = normalizeAiConfig(aiConfig);
  const contextBlock = String(payload.contextBlock || "").trim();
  const contextHash = String(payload.contextHash || "").trim();
  const nonce = String(payload.nonce || "").trim();

  if (!contextBlock) {
    return {
      ok: false,
      source: "local(validation)",
      detail: "empty context block"
    };
  }

  if (!contextHash || !nonce) {
    return {
      ok: false,
      source: "local(validation)",
      detail: "missing contextHash or nonce"
    };
  }

  if (!cfg.apiKey) {
    return {
      ok: false,
      source: "mock(no_api_key)",
      detail: "未配置可用 API Key，无法验证上下文读取"
    };
  }

  const messages = [
    {
      role: "system",
      content:
        "你是上下文校验助手。你必须读取给定上下文，并仅返回 JSON，不要输出其他文本。JSON 格式固定：{\"ack\":\"\",\"context_hash\":\"\",\"outline_present\":true,\"character_count\":0,\"location_count\":0,\"rule_count\":0}。"
    },
    {
      role: "user",
      content: [
        `请返回 ack=${nonce}`,
        `请返回 context_hash=${contextHash}`,
        "如果上下文中存在 Outline 且不为 none，则 outline_present 为 true，否则为 false。",
        "请统计 Characters、Locations、World Rules 中以 '- ' 开头的条目数量，分别填入 character_count/location_count/rule_count。",
        "只输出 JSON。",
        "",
        "上下文如下：",
        contextBlock
      ].join("\n")
    }
  ];

  try {
    const text = await requestWithOpenAICompatible(messages, cfg);
    const parsed = tryParseJsonObject(text);
    if (!parsed) {
      return {
        ok: false,
        source: `api:${cfg.model}`,
        detail: "AI 返回无法解析为 JSON"
      };
    }

    const ack = String(parsed.ack || "").trim();
    const returnedHash = String(parsed.context_hash || "").trim();
    const ackMatched = ack === nonce;
    const hashMatched = returnedHash === contextHash;
    const ok = ackMatched && hashMatched;
    const detail = ok
      ? "AI 已返回正确上下文回执"
      : `回执不一致: ackMatched=${ackMatched}, hashMatched=${hashMatched}`;

    return {
      ok,
      source: `api:${cfg.model}`,
      detail,
      receipt: {
        ack,
        context_hash: returnedHash,
        outline_present: Boolean(parsed.outline_present),
        character_count: Number(parsed.character_count || 0),
        location_count: Number(parsed.location_count || 0),
        rule_count: Number(parsed.rule_count || 0)
      }
    };
  } catch (error) {
    return {
      ok: false,
      source: `api_error:${cfg.model}`,
      detail: error.message
    };
  }
}

async function testAiConnection(aiConfig = {}) {
  const cfg = normalizeAiConfig(aiConfig);
  if (!cfg.apiKey) {
    throw new Error("API Key is required");
  }

  const base = cfg.baseUrl.replace(/\/$/, "");
  const commonHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`
  };

  const modelsResp = await fetch(`${base}/models`, {
    method: "GET",
    headers: commonHeaders
  });
  if (modelsResp.ok) {
    return {
      ok: true,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      detail: "models endpoint reachable"
    };
  }

  const chatResp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0
    })
  });

  if (chatResp.ok) {
    return {
      ok: true,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      detail: "chat endpoint reachable"
    };
  }

  const text = await chatResp.text();
  throw new Error(`AI API error ${chatResp.status}: ${text || "connection failed"}`);
}

module.exports = {
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
};



