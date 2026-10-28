# GitHub 上传说明

本目录已经整理为可直接接入 GitHub 仓库的项目根目录。

## 不要提交的内容

以下内容已由 `.gitignore` 排除：

- `.env`：本地数据库密码和 JWT 密钥
- `node_modules/`
- `dist/`
- `artifacts/`
- `database/mysql-data/`

首次上传前请确认 `.env` 没有被强制加入暂存区。

## 推荐上传命令

```bash
git status
git add .
git status
git commit -m "Complete ADC dental clinic management system and final report"
git push origin main
```

如果这是新的空仓库，可先设置远端：

```bash
git remote add origin https://github.com/18828620190-sys/Dental-Clinic-System.git
git branch -M main
git push -u origin main
```

## 提交后的最小验证

```bash
npm install
npm test
npm run build
```

数据库初始化和演示数据说明见 `README.md`。最终报告位于 `docs/final-report/`。
