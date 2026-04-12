# Workspace Studio

独立的本地工作区前端，不依赖 MuMu 的登录页面。

## 目录

- `backend/`：本地 API
- `frontend/`：独立 React 前端

## 启动后端

```powershell
.\workspace-studio\start-backend.ps1
```

默认地址：

- `http://127.0.0.1:8011`

## 启动前端

```powershell
cd workspace-studio\frontend
npm install
npm run dev
```

默认开发地址：

- `http://127.0.0.1:5180`

前端会代理 `/api` 到 `http://127.0.0.1:8011`。
