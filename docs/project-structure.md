# Project Structure (Detailed)

Generated: 2026-03-14

## Source Tree

```text
novel/
├─ docs/
│  └─ project-structure.md
├─ electron/
│  ├─ main.js
│  └─ preload.js
├─ public/
│  ├─ book-config.html
│  ├─ book-config.js
│  ├─ default-api.html
│  ├─ default-api.js
│  ├─ create-entry.html
│  ├─ cheat-mode.html
│  ├─ cheat-mode.js
│  ├─ index.html
│  ├─ outline.html
│  ├─ outline.js
│  ├─ shelf.html
│  ├─ shelf.js
│  ├─ styles.css
│  ├─ workspace.html
│  └─ workspace.js
├─ scripts/
│  ├─ clean-dist.js
│  └─ clean-user-data.js
├─ storage/
│  └─ (runtime sqlite files)
├─ .env.example
├─ AGENTS.md
├─ AGENTS.override.md
├─ ai.js
├─ db.js
├─ package-lock.json
├─ package.json
├─ README.md
├─ server.js
├─ 前后端交互标准文档.md
├─ 小说写作助手-v1-轻量化API方案.md
└─ 常用命令.md
```

## Large Directories Summary

- `node_modules/`: third-party dependencies (excluded from tree)
- `dist-electron/`: packaged desktop artifacts (excluded from tree)

## Notes

- Runtime data directory: `storage/` (可通过 `npm.cmd run clean:user-data` 清理)
- Backend entry: `server.js`
- Desktop entry: `electron/main.js`
- Frontend pages and scripts: `public/`
- Desktop preload bridge: `electron/preload.js`
- Lightweight scripts: `scripts/clean-user-data.js`, `scripts/clean-dist.js`

## 中文说明

- `docs/`: 项目文档目录，当前包含结构说明文档。
- `electron/`: 桌面端启动入口与窗口管理逻辑。
- `public/`: 前端页面、样式和脚本文件（书架、配置、大纲、工作台）。
- `storage/`: 本地 SQLite 数据库文件，保存书籍、章节、设定、日志、配置等数据。
- `.env.example`: 环境变量示例，不含真实密钥。
- `ai.js`: AI 调用与提示词组装逻辑。
- `db.js`: SQLite 初始化与表结构维护逻辑。
- `server.js`: Express 接口与业务主入口。
- `前后端交互标准文档.md`: API 规范文档。
- `小说写作助手-v1-轻量化API方案.md`: 产品与技术方案说明。
- `常用命令.md`: 常见构建/打包命令记录。


