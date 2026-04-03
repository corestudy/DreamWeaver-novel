# AGENTS Override (Compressed Context)

## Scope
- This file captures the minimum high-value context for continuing work in `D:\novel`.

## Repo Snapshot
- Project: `dreamweaver-novel`
- Stack: Node.js + Express + Electron + SQLite
- Node requirement: `>=18` (validated on `v22.17.1`)
- Module type: CommonJS
- Main files: `server.js`, `db.js`, `ai.js`, `electron/main.js`
- Key folders: `public/`, `electron/`, `scripts/`, `storage/`, `dist-electron/`, `docs/`

## Current Commands
- Dev: `npm.cmd run dev`
- Desktop run: `npm.cmd run desktop`
- Syntax check: `npm.cmd run check`
- Desktop package: `npm.cmd run build:desktop`
- Clean user data/config: `npm.cmd run clean:user-data`
- Clean package output: `npm.cmd run clean:dist`
- Lightweight cleanup: `npm.cmd run lightweight`

## Packaging Status (Windows)
- Last verified successful package build: `2026-03-14` (Asia/Shanghai).
- Verified command:
  - `$env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npm.cmd run build:desktop -- --config.win.signAndEditExecutable=false`
- Output exists in `dist-electron/`:
  - `DreamWeaver-novel Setup 1.0.0.exe`
  - `.blockmap`
  - `win-unpacked/`

## Security + Lightweight Changes (v3.3)
- `server.js` CORS hardened:
  - only allows `http://localhost:3000` and `http://127.0.0.1:3000` (plus no-origin local calls).
- `package.json` build files narrowed:
  - removed explicit `node_modules/**/*` from `build.files`.
  - keeps source + scripts; native dependency (`better-sqlite3`) still handled by builder/rebuild.
- Added cleanup scripts:
  - `scripts/clean-user-data.js`
  - `scripts/clean-dist.js`
- Local `storage/` was cleaned (user config/data removed).

## Product/Feature State
- Workspace AI path is unified:
  - `POST /api/projects/:projectId/ai/compose` is the primary write flow.
  - book context source: outline + characters/locations/rules + chat history.
- Chat storage:
  - `project_chat_messages` table + `GET/POST/DELETE /api/projects/:projectId/chat/messages`.
- Export feature:
  - in `workspace` supports `txt/md/html`, scope by current chapter / all chapters / AI result.
  - desktop uses Electron IPC `export:saveFile` via `electron/preload.js`.
- Default API page:
  - vendor presets expanded for long-context mainstream providers:
    `OpenAI / Anthropic / Gemini / xAI / DeepSeek / Qwen / Moonshot / OpenRouter / custom`
  - supports preset auto-fill + manual baseURL/model override.

## Docs Status
- API/interaction spec: `前后端交互标准文档.md` updated to `v3.3`.
- Structure doc: `docs/project-structure.md` synced with `scripts/` + `preload.js`.
- Usage docs refreshed: `README.md`, `常用命令.md`.

## Risks / Notes for Next Agent
- Workspace currently hides `#aiSource` and `#aiResult` in HTML; JS uses safe guards + `aiResultCache` fallback.
- Existing Chinese text in some files may look mojibake in certain terminals; do not assume source corruption without browser check.
- Folder is not a git repo (`.git` missing).

## Compressed Rules from AGENTS.md
- Prefer predictable structure and minimal moving parts.
- Use `npm.cmd` on Windows PowerShell environment.
- Do not commit secrets or generated DB data.
- For edits: keep compatibility with existing APIs unless explicitly changing spec; if changed, update docs immediately.


