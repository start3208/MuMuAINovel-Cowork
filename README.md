# Workspace Studio for MuMu Novel

<div align="center">

![Python](https://img.shields.io/badge/python-3.11-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green.svg)
![React](https://img.shields.io/badge/react-18-blue.svg)
![Workspace](https://img.shields.io/badge/workspace-markdown-orange.svg)
![License](https://img.shields.io/badge/license-GPL%20v3-blue.svg)

**面向 Claude Code / Codex 的本地工作区协作与同步工作台**

[项目定位](#-项目定位) • [核心能力](#-核心能力) • [快速开始](#-快速开始) • [目录结构](#-目录结构) • [文档索引](#-文档索引)

</div>

---

## ✨ 项目定位

`Workspace Studio` 是基于 **MuMu Novel** 二次开发的本地工作区协作层，目标是把原项目的小说创作能力延伸到 `Claude Code`、`Codex` 等代码助手场景中，让项目数据能够以 **本地 Markdown 工作区** 的形式参与人机共创。

它并不是脱离 MuMu Novel 独立运行的创作系统，而是建立在 MuMu 现有业务与 API 之上的扩展工作台：

- **MuMu Novel** 负责原始项目页、数据库、远端项目数据与业务 API
- **Workspace Studio** 负责本地工作区编辑、校验、备份与同步体验
- **tools/mumu_workspace.py** 负责工作区导入、导出、结构校验与标准化写回

换句话说，`Workspace Studio` 的价值不在于替代 MuMu，而在于为 MuMu 增加一条更适合本地编辑与 AI 协作的工作流。

## 🧩 核心能力

- **工作区拉取与回写**：将 MuMu 项目拉取为本地 Markdown 工作区，并在校验后写回标准结构
- **本地结构化编辑**：围绕角色、组织、关系、职业、大纲、章节、伏笔、记忆等数据进行本地管理
- **提示词协作入口**：自动生成工作区级 `CLAUDE.md` 与 `tool_README.md`，方便在代码助手中直接接续创作
- **数据同步链路**：通过 MuMu API 完成远端数据读取、记忆检索、索引重建与同步回 MuMu
- **安全落盘机制**：保存前进行 schema 校验，并在关键操作前后生成备份

## 🏗️ 架构关系

### Workspace Studio 与 MuMu Novel 的协作方式

1. `MuMu Novel` 作为原始系统，提供项目、记忆与同步相关 API。
2. `Workspace Studio` 以本地工作区为中心提供编辑界面与本地 API。
3. 工作区数据通过 `tools/mumu_workspace.py` 完成结构转换、校验与写回。
4. 当需要远端能力时，由 `Workspace Studio` 调用 MuMu API 执行拉取、查询或同步。

### 这意味着

- 只启动 `Workspace Studio` 并不能替代 `MuMu Novel`
- `Workspace Studio` 的远端记忆浏览、语义检索、重建索引、同步回 MuMu 等能力都依赖 MuMu API
- 本地保存默认写入工作区文件，不会直接绕过工作区结构去改数据库

## 🚀 快速开始

### 1. 先准备 MuMu Novel 运行环境

请先参考原项目说明完成 MuMu Novel 的环境准备、依赖安装和基础启动：

- [docs/MUMU_README.md](docs/MUMU_README.md)

尤其需要确保：

- `backend/.venv` 已创建并可用
- MuMu Novel 后端能够正常启动
- 本地认证与 API 访问配置已正确设置

### 2. 启动 MuMu Novel

```powershell
python start_mumu.py
```

默认访问地址：

- `http://127.0.0.1:8000`

### 3. 启动 Workspace Studio

```powershell
python workspace-studio/start_studio.py
```

默认访问地址：

- `http://127.0.0.1:8011`

### 4. 启动脚本行为说明

`workspace-studio/start_studio.py` 的默认行为是：

- 检查 `workspace-studio/frontend/node_modules`
- 如缺失则自动执行 `npm install`
- 检查 `workspace-studio/frontend-dist/index.html`
- 如缺失则自动执行 `npm run build`
- 最终以前台方式启动 `8011` 端口的 Uvicorn 服务

**通过脚本启动 Workspace Studio 时，不会占用 `5180` 端口。**

`5180` 只会在你手动进入前端目录并执行 `npm run dev` 时，被 Vite 开发服务器占用。

## 🌐 端口说明

- `8000`：MuMu Novel 主应用
- `8011`：Workspace Studio 前端页面与本地 API
- `5180`：仅在手动启用 Vite 前端开发模式时使用

## 📁 目录结构

### 仓库主要目录

```text
mumu-novel/
├── backend/                    # MuMu Novel 后端
├── frontend/                   # MuMu Novel 前端
├── tools/                      # 工作区导入导出与校验工具
├── workspace/                  # 本地工作区与备份目录
├── workspace-studio/
│   ├── backend/                # Workspace Studio 本地 API
│   ├── frontend/               # Workspace Studio React 源码
│   ├── frontend-dist/          # Workspace Studio 构建产物
│   └── start_studio.py         # Workspace Studio 启动脚本
└── docs/
    └── MUMU_README.md          # 原 MuMu Novel README
```

### 工作区目录结构

`Workspace Studio` 新建工作区默认采用双层目录：

- `workspace/ws-项目名称-项目id/`：工作区容器目录
- `workspace/ws-项目名称-项目id/CLAUDE.md`：供 Claude Code / Codex 使用的工作区提示词
- `workspace/ws-项目名称-项目id/tool_README.md`：镜像自 `tools/README.md` 的工具说明
- `workspace/ws-项目名称-项目id/项目名称/`：真实 Markdown 数据目录

旧版单层目录工作区仍然兼容，Studio 会自动识别。

## 🔄 数据与同步约定

- 工作区保存时直接复用 `tools/mumu_workspace.py` 的核心逻辑
- 保存前会先执行 schema 校验，再写回标准受管路径
- 工作区根目录下以下划线或点开头的目录不会被识别成书籍目录
- 工作区根目录下的 `CLAUDE.md`、`AGENTS.md`、`GEMINI.md` 等说明文件不会因为保存而被删除
- 远端记忆读取、远端索引重建与同步回 MuMu 均依赖 MuMu API

## 💾 备份机制

- 统一备份目录：`workspace/_backup/`
- `workspace/_backup/ws/<project_id>/`：本地工作区 JSON 备份
- `workspace/_backup/mumu/<project_id>/`：MuMu 远端项目 JSON 备份
- 拉取、同步、删除、导入备份、清理备份等关键操作均要求二次确认
- 每个项目每个来源默认最多保留 10 份备份；执行清理后收缩到最近 5 份

## 📚 文档索引

- [docs/MUMU_README.md](docs/MUMU_README.md)：原 MuMu Novel README
- [workspace-studio/README.md](workspace-studio/README.md)：Workspace Studio 独立说明
- [tools/README.md](tools/README.md)：工作区工具、目录规范与使用说明

测试清单、交接记录等内部维护文档不在本 README 中展开。

## 🛠️ 前端开发模式

如果你需要单独调试 Workspace Studio 前端热更新，可以手动启动 Vite：

```powershell
python workspace-studio/start_studio.py
cd workspace-studio\frontend
npm install
npm run dev
```

此时会同时使用：

- `8011`：Workspace Studio 本地 API
- `5180`：Vite 前端开发服务器

前端开发服务器会将 `/api` 代理到 `http://127.0.0.1:8011`。

## 📝 许可证

本项目采用 [GNU General Public License v3.0](LICENSE)。
