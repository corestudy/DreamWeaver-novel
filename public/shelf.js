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
  grid.innerHTML = "";

  if (!Array.isArray(list) || list.length === 0) {
    const card = document.createElement("div");
    card.className = "panel";
    card.innerHTML = "<h3>书架为空</h3><p class='muted'>点击右上角“添加新书籍”开始创建。</p>";
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

    const coverBlock = book.cover_image
      ? `<div class="book-spine-cover" style="background-image:url('${String(book.cover_image).replace(/'/g, "%27")}')"></div>`
      : "<div class=\"book-spine-cover fallback\">NO IMG</div>";

    card.innerHTML = `
      <div class="book-top" style="background:${safeColor}"></div>
      <div class="book-body">
        ${coverBlock}
        <h3>${safeName}</h3>
        <p class="muted">${safeDesc}</p>
        <div class="book-meta">章节: ${safeCount}</div>
        <div class="book-actions action-row-2">
          <a class="ghost-btn link-btn action-edit" href="/book-config.html?projectId=${book.id}">编辑配置</a>
          <button class="danger ghost-danger action-delete" data-action="delete" data-id="${book.id}" data-name="${safeName}">删除书籍</button>
        </div>
      </div>
    `;

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
