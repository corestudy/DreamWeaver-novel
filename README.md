# DreamWeaver-novel

DreamWeaver-novel 是一个本地优先的小说写作助手，技术栈为 `Express + SQLite + Electron + 原生前端`。

- 当前版本：`v1.0`（`package.json` 为 `1.0.0`）
- 运行环境：Node.js `22.x`（建议 `22.17.1`）
- 平台建议：Windows + PowerShell + `npm.cmd`

## 快速开始

```powershell
npm.cmd install
npm.cmd run dev
```

启动后访问：
- `http://127.0.0.1:3000`
- `http://localhost:3000`

## 常用命令

- 开发启动：`npm.cmd run dev`
- 桌面运行：`npm.cmd run desktop`
- 语法与接口文档一致性检查：`npm.cmd run check`
- 原生模块自检：`npm.cmd run native:check`
- 打包（Windows）：`npm.cmd run build:desktop`
- 打包前全链路检查（推荐）：`npm.cmd run build:desktop:ready`

## 原生模块（better-sqlite3）说明

安装依赖后会自动执行：
- `npm.cmd run native:rebuild:node`

若出现 ABI / bindings 错误，依次执行：

```powershell
npm.cmd run native:rebuild:node
npm.cmd run native:check
```

## 数据目录与清理

- 数据库路径：`storage/dreamweaver_novel.sqlite`
- 清理本地数据（含书籍、配置、聊天、日志）：`npm.cmd run clean:user-data`
- 清理打包产物：`npm.cmd run clean:dist`
- 一键轻量化清理：`npm.cmd run lightweight`

## 发布前检查（v1.0）

```powershell
npm.cmd run check
npm.cmd run native:check
```

如需发布桌面安装包：

```powershell
npm.cmd run build:desktop:ready
```

若遇到签名或权限相关问题，可使用：

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npm.cmd run build:desktop -- --config.win.signAndEditExecutable=false
```

## 发布到 GitHub（v1.0）

```powershell
git add .
git commit -m "release: v1.0"
git tag -a v1.0 -m "DreamWeaver-novel v1.0"
git push origin <branch> --tags
```

建议在 GitHub Releases 的 `v1.0` 中附加：
- `dist-electron/DreamWeaver-novel Setup 1.0.0.exe`
- 对应 `.blockmap`
- （可选）`win-unpacked/`
