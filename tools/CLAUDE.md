# CLAUDE.md

你正在工作于一个 MuMu Workspace 工作区容器内。

## 先读哪里

- 优先阅读同目录下的 `tool_README.md`
- 真实项目数据位于 `./{{DATA_DIR_NAME}}/`
- 进入具体 section 之前，优先查看对应目录的 `_index.md`

## 当前工作区

- 容器目录：`{{CONTAINER_NAME}}`
- 数据目录：`{{DATA_DIR_NAME}}`
- 项目标题：`{{PROJECT_TITLE}}`
- source_project_id：`{{SOURCE_PROJECT_ID}}`

## 工作规则

- 不要随意重命名或删除 `./{{DATA_DIR_NAME}}/` 下的标准 section 目录
- 不要在标准 section 目录里新增无关 `.md` 文件
- 角色卡中的 `organization_members` 只是展示摘要，不是组织成员主数据；主数据看 `organization-members/`
- 关系、组织成员、角色职业、故事记忆都已经按分组目录管理，先看根 `_index.md`，再进入分组目录
- 若需校验、回转 JSON 或同步，请按 `tool_README.md` 中的命令执行

## 常用起手动作

```powershell
ls
ls .\{{DATA_DIR_NAME}}
Get-Content .\tool_README.md
Get-Content .\{{DATA_DIR_NAME}}\chapters\_index.md
```
