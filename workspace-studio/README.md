# Workspace Studio

独立的本地工作区前端，不依赖 MuMu 的登录页面。
数据源是本地 Markdown 工作区，保存时会通过 `tools/mumu_workspace.py` 的同一套核心校验和写回逻辑同步到 md。

## 启动方式

现在只保留两个前台 Python 启动脚本：

```powershell
python start_mumu.py
python workspace-studio/start_studio.py
```

它们分别在各自终端前台运行。
关闭终端窗口，对应服务就会停止。

## 端口

- `http://127.0.0.1:8000`：MuMuAINovel 主应用
- `http://127.0.0.1:8011`：Workspace Studio

其中 Workspace Studio 的前端页面和本地 API 都合并在 `8011`，不再默认使用 `5180`。

正常情况下，只需要记住这两个地址。

## 目录

- `backend/`：本地 API
- `frontend/`：独立 React 前端源码
- `frontend-dist/`：前端构建产物

## 数据约定

- `Workspace Studio` 不是通过调用命令行文本输出来保存数据，而是直接复用 `tools/mumu_workspace.py` 里的核心函数。
- 前端修改后，后端会先做 schema 校验，再重写工作区的标准受管路径。
- 工作区根目录下以下划线或点开头的自定义目录不会被识别成一本书。
- 工作区根目录下的 `CLAUDE.md`、`AGENTS.md`、`GEMINI.md` 这类说明文件不会因为保存而被删除。
- 建议把草稿、笔记、缓存放进 `_notes/`、`_drafts/`、`.cache/` 这类目录。

## 可选：前端开发模式

只有在你需要单独调试前端热更新时，才需要这个模式。

```powershell
python workspace-studio/start_studio.py
cd workspace-studio\frontend
npm install
npm run dev
```

这时会占用两个端口：

- `8011`：Workspace Studio 本地 API
- `5180`：Vite 前端开发服务器

前端会代理 `/api` 到 `http://127.0.0.1:8011`。
