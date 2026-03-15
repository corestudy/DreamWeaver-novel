# 上传到 GitHub 操作指南（Windows / PowerShell）

本指南适用于你当前项目 `D:\novel`，目标是安全、可重复地上传到 GitHub。

## 1. 预检查（避免上传隐私和大文件）

在项目根目录执行：

```powershell
cd D:\novel
```

确认以下内容不会被上传：
- `storage/`（本地数据库与个人写作数据）
- `.env`（若存在）
- `dist-electron/`（打包产物体积大）
- `node_modules/`

建议使用下面的 `.gitignore`（若还没有）：

```gitignore
node_modules/
dist-electron/
storage/
.env
*.log
```

## 2. 初始化 Git 仓库

```powershell
git init
git branch -M main
```

## 3. 配置提交身份（首次需要）

```powershell
git config user.name "你的GitHub用户名"
git config user.email "你的GitHub邮箱"
```

## 4. 首次提交

```powershell
git add .
git status
git commit -m "chore: initial commit"
```

## 5. 在 GitHub 创建远程仓库

去 GitHub 新建一个空仓库（不要勾选 README / .gitignore / license），得到仓库地址：

- HTTPS 示例：`https://github.com/<你的用户名>/<仓库名>.git`
- SSH 示例：`git@github.com:<你的用户名>/<仓库名>.git`

## 6. 绑定远程并推送

```powershell
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果提示认证失败：
- HTTPS：使用 GitHub PAT（Personal Access Token）作为密码
- SSH：先配置 SSH Key，再改用 SSH 地址

## 7. 后续更新常用流程

```powershell
git add .
git commit -m "feat: 你的改动说明"
git push
```

## 8. 上传前安全检查（建议每次执行）

```powershell
git status
git diff --name-only --cached
```

重点确认未包含：
- API Key / Token / SSH 私钥
- `storage/*.sqlite*`
- 打包产物 `dist-electron/*`

## 9. 可选：关联 README 中仓库地址

上传成功后，可在 `README.md` 增加项目 GitHub 链接，便于后续协作。
