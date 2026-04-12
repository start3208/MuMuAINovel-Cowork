# MuMu Workspace 使用说明

这套工作流用于把 MuMuAINovel 的项目导出 JSON 转成适合 Claude Code 编辑的 Markdown 工作区，再从 Markdown 回转成可重新导入的 JSON。

它现在也支持直接调用本地 MuMuAINovel 后端完成：

- 列出项目与书籍 ID
- 按项目 ID 导出 JSON
- 直接导入 JSON
- 严格同步到指定书籍

## 适用场景

- 在 Claude Code 中进行正文写作、世界观整理、角色维护、伏笔维护
- 保留 MuMuAINovel 的结构化导入导出能力
- 用 Markdown 作为“人类可读、可编辑”的中间格式

## 工作区结构

- `project.md`：项目级信息
- `project-default-style.md`：项目默认写作风格
- `chapters/`：章节
- `characters/`：角色或组织角色卡
- `outlines/`：大纲
- `relationships/`：角色关系
- `organizations/`：组织详情
- `organization-members/`：组织成员
- `careers/`：职业体系
- `character-careers/`：角色职业关联
- `foreshadows/`：伏笔
- `generation-history/`：生成历史
- `story-memories/`：故事记忆
- `plot-analysis/`：剧情分析
- `writing-styles/`：写作风格

每个目录下都会生成一个 `_index.md`，用于把短文件名映射到真实标题和关键字段。

## 文件命名

为了方便 Claude Code 用 `ls` 快速定位，记录文件采用短前缀命名：

- `ch-001-...`：章节
- `char-001-...`：角色
- `out-001-...`：大纲
- `rel-001-...`：关系
- `org-001-...`：组织
- `member-001-...`：组织成员
- `career-001-...`：职业
- `charcareer-001-...`：角色职业关联
- `fs-001-...`：伏笔
- `gen-001-...`：生成历史
- `memory-001-...`：故事记忆
- `analysis-001-...`：剧情分析

## Claude Code 推荐工作流

1. 先从 MuMuAINovel 导出项目 JSON。
2. 运行 `json-to-md` 生成工作区。
3. 在 Claude Code 里先 `ls` 看目录，再读对应目录的 `_index.md`。
4. 只打开并编辑你需要的 Markdown 文件。
5. 编辑完成后运行 `validate`。
6. 再运行 `md-to-json` 生成回转 JSON。
7. 把新 JSON 导回 MuMuAINovel。

如果你不想打开前端页面，也可以直接用同一个脚本列项目、导出、导入、严格同步。
`Workspace Studio` 也是直接复用这套核心读写与校验逻辑，不是另走一套独立格式。

## 后端直连命令

```powershell
python tools/mumu_workspace.py list-projects
python tools/mumu_workspace.py export-project <project_id> output.json
python tools/mumu_workspace.py import-project output.json
python tools/mumu_workspace.py sync-project <target_project_id> output.json
```

默认会读取 `backend/.env` 中的：

- `LOCAL_AUTH_USERNAME`
- `LOCAL_AUTH_PASSWORD`
- `APP_HOST`
- `APP_PORT`

如果需要，也可以手动传入：

```powershell
python tools/mumu_workspace.py list-projects --base-url http://127.0.0.1:8000 --username admin --password admin123
```

## 常用命令

```powershell
python tools/mumu_workspace.py json-to-md <export.json> workspace/<folder>
python tools/mumu_workspace.py validate workspace/<folder>
python tools/mumu_workspace.py md-to-json workspace/<folder> output.json
python tools/mumu_workspace.py validate output.json
python tools/mumu_workspace.py list-projects
python tools/mumu_workspace.py export-project <project_id> output.json
python tools/mumu_workspace.py import-project output.json
python tools/mumu_workspace.py sync-project <target_project_id> output.json
```

## 命令说明

- `json-to-md <export.json> <workspace_dir>`
  把 MuMuAINovel 导出的 JSON 转成 Markdown 工作区，适合在 Claude Code 中编辑。
- `validate <path>`
  校验输入内容是否合法。
  `path` 可以是 JSON 文件，也可以是 Markdown 工作区目录。
- `md-to-json <workspace_dir> <output.json>`
  把 Markdown 工作区重新组装成可导回 MuMuAINovel 的 JSON。
- `list-projects`
  连接本地后端，列出当前账号下所有书籍及其 `project_id`。
- `export-project <project_id> <output.json>`
  直接按项目 ID 从本地后端导出书籍。
  导出文件会附带 `source_project_id`，便于后续严格同步。
- `import-project <input_path>`
  导入 JSON 或工作区目录为一个新项目。
  这个命令不会覆盖已有项目。
- `sync-project <target_project_id> <input_path>`
  严格同步到指定书籍。
  会先校验、再备份、最后覆盖目标项目内容。

## 导航建议

```powershell
ls workspace/<folder>
ls workspace/<folder>/chapters
Get-Content workspace/<folder>/chapters/_index.md
Get-Content workspace/<folder>/chapters/ch-001-*.md
```

## 编辑规则

- 不要删除或重命名各个 section 目录。
- 不要删除 `_index.md`，它是导航文件。
- `project.md`、`project-default-style.md` 这些顶层文件也不要随意改名。
- Markdown 正文可以直接改。
- 代码块里的 JSON 结构也可以直接改。
- 文件名本身不是导入依据，导入依据是文件内容；所以一般不需要手动改文件名。

## 保留与忽略规则

保存工作区时，脚本和 `Workspace Studio` 只会重写“标准受管路径”，不会整目录清空。

会被脚本重写的标准路径包括：

- `README.md`
- `.mumu-workspace.toml`
- `project.md`
- `project-default-style.md`
- `chapters/`
- `characters/`
- `outlines/`
- `relationships/`
- `organizations/`
- `organization-members/`
- `careers/`
- `character-careers/`
- `foreshadows/`
- `generation-history/`
- `story-memories/`
- `plot-analysis/`
- `writing-styles/`

下列内容默认会被保留，不会因为保存工作区而被删除：

- 工作区根目录下自定义的 `_notes/`、`_drafts/`、`.cache/` 这类以下划线或点开头的目录
- 工作区根目录下不属于标准受管路径的自定义文件
- `CLAUDE.md`、`AGENTS.md`、`GEMINI.md` 这类 AI 协作说明文件

同时，工作目录下以下划线或点开头的目录不会被识别为一本书或一个工作区。
建议把草稿、说明、缓存都放进这些目录里。

## 给 AI / Claude Code 的建议

- 优先只修改已有文件，不要随意新增 Markdown 文件。
- 如果必须新增内容，优先放进现有记录文件中，而不是新建“临时说明.md”之类的文件。
- 不要在这些已知目录里随意新增额外 `.md` 文件：
  - `chapters/`
  - `characters/`
  - `outlines/`
  - `relationships/`
  - `organizations/`
  - `organization-members/`
  - `careers/`
  - `character-careers/`
  - `foreshadows/`
  - `generation-history/`
  - `story-memories/`
  - `plot-analysis/`
  - `writing-styles/`
- 因为这些目录中的 `.md` 文件会被当成正式数据记录参与回转，额外文件可能破坏导入或校验。
- 如果 AI 需要写额外说明、临时想法、草稿，请放在工作区根目录下的自定义目录里，例如：
  - `_notes/`
  - `_scratch/`
  - `_drafts/`
- 这些额外目录推荐以下划线或点开头；这类目录不会被识别成新的工作区。
- `CLAUDE.md`、`AGENTS.md`、`GEMINI.md` 这类根目录说明文件可以保留，保存工作区时不会被脚本删除。
- 修改字段时优先保留已有字段，不要删除 schema 中已经存在的字段。
- 缺失字段会在转换时自动补默认值，但多余字段会导致校验失败。

## 格式约定

- 每个 Markdown 文件都有 TOML frontmatter。
- 长文本字段会展开为正文块。
- 结构化数据会保留为 JSON 代码块。
- 一些原本就是“JSON 字符串”的字段会以高保真方式保存，保证 `json -> md -> json` 尽量不失真。
- 工作区会尽量把 schema 中的所有字段都 materialize 到 Markdown 中，避免回转时丢字段。

## 校验说明

`validate` 支持两种输入：

- 原始导出 JSON
- Markdown 工作区目录

在 `md-to-json` 之前先跑一次 `validate`，可以更早发现字段缺失、类型错误或结构损坏。

当前校验规则：

- 缺失字段：不会直接报错，会按照 schema 自动补默认值、空字符串、空数组或空对象
- 多余字段：会直接报错，无法通过校验
- 顶层字段和各 section 记录字段都会检查

## 书籍 ID 说明

- `list-projects` 会直接打印项目 ID，便于定位书籍。
- `export-project` 导出的 JSON 顶层会额外包含 `source_project_id`。
- 生成的工作区元数据 `.mumu-workspace.toml` 也会保留这个来源项目 ID。

## 严格同步说明

`sync-project` 会执行严格校验，避免把错误内容同步到错误书籍：

- 先做本地结构校验
- 再调用服务端 `/validate-import`
- 要求输入里必须存在 `source_project_id`
- 要求 `source_project_id` 与目标 `target_project_id` 完全一致
- 正式同步前会自动导出目标书籍备份到 `workspace/backups/`

推荐用法：

```powershell
python tools/mumu_workspace.py list-projects
python tools/mumu_workspace.py export-project <project_id> workspace\book.json
python tools/mumu_workspace.py json-to-md workspace\book.json workspace\book-workspace
python tools/mumu_workspace.py validate workspace\book-workspace
python tools/mumu_workspace.py sync-project <project_id> workspace\book-workspace
```
