# 小说写作助手 Demo

一个本地优先的小说写作助手，技术栈为 `Express + SQLite + Electron + 原生前端`。

## 运行环境
- Node.js `22.x`（建议 `22.17.1`，见 `.nvmrc`）
- Windows 建议使用 `npm.cmd`

## 常用命令
- 开发启动：`npm.cmd run dev`
- 桌面运行：`npm.cmd run desktop`
- 语法检查（含接口文档一致性校验）：`npm.cmd run check`
- 原生模块自检：`npm.cmd run native:check`
- 一键测试后打包（推荐）：`npm.cmd run build:desktop:ready`
- 打包 EXE：`npm.cmd run build:desktop`

## 原生模块稳定性
- 安装依赖后会自动执行：`npm.cmd run native:rebuild:node`
- 若出现 `NODE_MODULE_VERSION` / `Could not locate the bindings file`，先执行：
  - `npm.cmd run native:rebuild:node`
  - `npm.cmd run native:check`

## 数据与配置
- 本地数据库路径：`storage/novel_demo.sqlite`
- 清理本地数据（含 API Key、书籍、聊天、日志）：`npm.cmd run clean:user-data`
- 清理打包产物：`npm.cmd run clean:dist`
- 一键轻量化清理：`npm.cmd run lightweight`

## 打包说明（Windows）
若遇到签名或权限相关问题，可使用：

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npm.cmd run build:desktop -- --config.win.signAndEditExecutable=false
```
