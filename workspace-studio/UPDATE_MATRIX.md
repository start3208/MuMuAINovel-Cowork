# Workspace Studio Update 功能表

本文只分析 MuMu `/project/...` 业务线相关页面的更新能力，不包含后台管理、认证、系统设置、提示词工坊等非项目创作页面。

## 说明

- `MuMu 后端接口`：对应 `backend/app/api/` 中的更新入口
- `MuMu 联动`：原项目在更新后会同步影响哪些数据
- `WS 当前状态`：
  - `已覆盖`：Workspace Studio 已实现等价或近似本地联动
  - `部分覆盖`：已实现主要联动，但仍有明显差距
  - `未覆盖`：当前没有对应的本地页面或联动能力

## 功能表

| 模块 | MuMu 后端接口 | MuMu 联动 | WS 当前状态 | 备注 |
| --- | --- | --- | --- | --- |
| 项目/世界设定 | `projects.update_project` | 直接更新项目字段，无额外级联 | 已覆盖 | `WorkspaceWorldSettingPage` 已保存项目字段 |
| 角色编辑 | `characters.update_character` | 组织字段同步到 `Organization`；角色职业冗余字段同步；组织返回时合并详情；关系/成员展示为派生摘要 | 已覆盖 | WS 已补角色改名级联、组织字段合并回填、组织详情同步 |
| 角色删除 | `characters.delete_character` | 删除角色与职业关联 | 已覆盖 | WS 还会同步清理关系、组织成员、伏笔角色引用、故事记忆角色引用等 |
| 职业编辑 | `careers.update_career` | 更新职业本体 | 已覆盖 | WS 已补职业名称联动 `character_careers` |
| 职业删除 | `careers.delete_career` | 后端会阻止删除被角色使用的职业 | 已覆盖 | WS 现在会阻断删除并列出绑定该职业的角色 |
| 角色职业阶段 | `careers.update_career_stage` / 角色职业相关 API | 更新 `CharacterCareer` 与角色主职业阶段冗余字段 | 未覆盖 | WS 目前没有独立角色职业编辑页 |
| 组织编辑 | `organizations.update_organization` | 更新 `Organization` 本体 | 已覆盖 | WS 组织管理和角色管理中的“编辑组织”都已同步更新 `organizations[]` |
| 组织成员编辑 | `organizations.update_organization_member` | 更新成员信息 | 已覆盖 | WS 会同步刷新 `member_count` 和组织角色卡成员摘要 |
| 关系编辑 | `relationships.update_relationship` | 更新关系本体 | 已覆盖 | WS 会同步刷新角色卡中的 `relationships` 摘要 |
| 大纲编辑 | `outlines.update_outline` | 更新标题/内容；同步 `structure`；一对一模式同步章节标题 | 已覆盖 | WS 已补 `structure.content`、一对一章节标题联动 |
| 大纲删除 | `outlines.delete_outline` | 删除关联章节；清理相关分析/记忆/伏笔 | 已覆盖 | WS 会删除关联章节，并清理 `generation_history / story_memories / plot_analysis` 与分析来源伏笔；删除前会提示关联章节和伏笔 |
| 章节编辑 | `chapters.update_chapter` | 更新字数；内容清空时清理分析、记忆、向量记忆、分析来源伏笔 | 已覆盖 | WS 已同步字数与清理 `generation_history / story_memories / plot_analysis` 及分析来源伏笔 |
| 章节删除 | `chapters.delete_chapter` | 清理相关记忆/分析/伏笔并更新项目字数 | 已覆盖 | WS 已同步清理章节关联的生成历史、记忆、剧情分析及分析来源伏笔；删除前会提示关联伏笔 |
| 章节规划 | `chapters.update_chapter_expansion_plan` | 更新 `summary` 与 `expansion_plan` | 未覆盖 | WS 章节页目前没有独立规划编辑器 |
| 伏笔编辑 | `foreshadows.update_foreshadow` | 更新伏笔本体 | 已覆盖 | WS 已支持编辑 |
| 伏笔埋入/回收/废弃 | `foreshadows.plant/resolve/abandon` | 更新状态及章节号/时间信息 | 已覆盖 | WS 已支持埋入、回收、废弃 |
| 写作风格编辑 | `writing_styles.update_writing_style` | 更新写作风格本体 | 已覆盖 | WS 本轮已补编辑 |
| 写作风格默认值 | `writing_styles.set_default_style` | 更新项目默认风格 | 已覆盖 | WS 本轮已补“设为默认” |
| 写作风格删除 | `writing_styles.delete_writing_style` | 后端禁止删除默认风格 | 已覆盖 | WS 现在会阻断删除，并提示当前默认风格绑定关系 |

## 本轮重点完善

- 统一本地联动工具：`workspace-studio/frontend/src/workspace-utils.ts`
- 角色改名后的全局引用同步：
  - `relationships`
  - `organization_members`
  - `organizations`
  - `character_careers`
  - `foreshadows.related_characters`
  - `story_memories.related_characters`
  - `outlines.structure.characters`
  - `chapters.expansion_plan.character_focus`
  - `plot_analysis.character_states / relationship_changes`
- 冗余摘要重建：
  - `characters[].relationships`
  - `characters[].organization_members`
  - 组织角色的 `power_level / location / motto / color`
  - `organizations[].member_count`
- 大纲一对一模式章节标题联动
- 大纲删除 / 章节删除时的章节关联数据清理
- 大纲/章节删除前展示关联伏笔清单
- 写作风格编辑 / 默认风格设置 / 删除
- 职业删除前展示角色职业绑定清单
- 默认风格删除前展示绑定提示
- 角色管理中“编辑组织”对齐 MuMu 的组织详情回填

## 仍建议后续补齐的点

- 角色职业独立编辑（主职业 / 副职业 / 阶段）
- 章节 `expansion_plan` 独立编辑
- 分析来源伏笔在章节清空 / 删除时的更精细清理策略
- 写作风格“默认风格不可删除”的本地阻断
