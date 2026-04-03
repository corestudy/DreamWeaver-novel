const API_BASE = window.location.origin;

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

function normalizeCoverImageUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "data:") {
      return parsed.href;
    }
  } catch {
    // ignore invalid url
  }
  return "";
}


function showNotice(message, type = "info", timeout = 2600) {
  const el = byId("shelfNotice");
  el.textContent = message;
  el.className = `notice ${type}`;
  if (timeout > 0) {
    window.setTimeout(() => {
      el.className = "notice hidden";
      el.textContent = "";
    }, timeout);
  }
}

function renderShelf(list) {
  const grid = byId("shelfGrid");
  grid.replaceChildren();

  if (!Array.isArray(list) || list.length === 0) {
    const card = document.createElement("div");
    card.className = "panel";
    const title = document.createElement("h3");
    title.textContent = "暂无作品";
    const desc = document.createElement("p");
    desc.className = "muted";
    desc.textContent = "先在作品配置页创建第一本书。";
    card.appendChild(title);
    card.appendChild(desc);
    grid.appendChild(card);
    return;
  }

  list.forEach((book) => {
    const slot = document.createElement("div");
    slot.className = "shelf-cell";

    const card = document.createElement("article");
    card.className = "book-card book-card-clickable book-spine";
    card.dataset.workspaceUrl = `/workspace.html?projectId=${book.id}`;

    const safeName = String(book.name || "未命名作品");
    const safeDesc = String(book.description || "暂无简介");
    const safeColor = String(book.cover_color || "#ff5f7a");
    const safeCount = Number(book.chapter_count || 0);

    const top = document.createElement("div");
    top.className = "book-top";
    top.style.background = safeColor;

    const body = document.createElement("div");
    body.className = "book-body";

    const cover = document.createElement("div");
    cover.className = "book-spine-cover";
    const coverUrl = normalizeCoverImageUrl(book.cover_image);
    if (coverUrl) {
      cover.style.backgroundImage = `url("${coverUrl}")`;
    } else {
      cover.classList.add("fallback");
      cover.textContent = "NO IMG";
    }

    const title = document.createElement("h3");
    title.textContent = safeName;

    const desc = document.createElement("p");
    desc.className = "muted";
    desc.textContent = safeDesc;

    const meta = document.createElement("div");
    meta.className = "book-meta";
    meta.textContent = `章节: ${safeCount}`;

    const actions = document.createElement("div");
    actions.className = "book-actions action-row-2";

    const editLink = document.createElement("a");
    editLink.className = "ghost-btn link-btn action-edit";
    editLink.href = `/book-config.html?projectId=${book.id}`;
    editLink.textContent = "编辑配置";

    const delBtn = document.createElement("button");
    delBtn.className = "danger ghost-danger action-delete";
    delBtn.dataset.action = "delete";
    delBtn.dataset.id = String(book.id);
    delBtn.dataset.name = safeName;
    delBtn.textContent = "删除作品";

    actions.appendChild(editLink);
    actions.appendChild(delBtn);

    body.appendChild(cover);
    body.appendChild(title);
    body.appendChild(desc);
    body.appendChild(meta);
    body.appendChild(actions);

    card.appendChild(top);
    card.appendChild(body);
    slot.appendChild(card);
    grid.appendChild(slot);
  });
}

async function deleteBook(projectId, name) {
  const ok = window.confirm(`确认删除《${name}》吗？\n该书章节、设定和日志会一起删除。`);
  if (!ok) {
    return;
  }

  await api(`/api/projects/${projectId}`, { method: "DELETE" });
  showNotice(`《${name}》已删除`);
  await bootstrap();
}

function bindEvents() {
  document.body.addEventListener("click", (event) => {
    const card = event.target.closest(".book-card-clickable");
    if (card) {
      const interactive = event.target.closest("a,button,input,textarea,select");
      if (!interactive && card.dataset.workspaceUrl) {
        window.location.href = card.dataset.workspaceUrl;
        return;
      }
    }

    const btn = event.target.closest("[data-action='delete']");
    if (!btn) {
      return;
    }

    const projectId = Number(btn.dataset.id);
    const name = btn.dataset.name || "未命名作品";
    deleteBook(projectId, name).catch((error) => showNotice(error.message, "error", 5000));
  });
}

async function bootstrap() {
  try {
    const list = await api("/api/bookshelf");
    renderShelf(list);
  } catch (error) {
    showNotice(error.message, "error", 5000);
  }
}

bindEvents();
bootstrap();
