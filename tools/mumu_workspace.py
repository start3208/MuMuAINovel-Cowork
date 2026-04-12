from __future__ import annotations

import argparse
import http.cookiejar
import json
import mimetypes
import re
import shutil
import sys
import textwrap
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import tomllib


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from pydantic import ValidationError  # type: ignore
from app.schemas.import_export import ProjectExportData  # type: ignore


SUPPORTED_VERSIONS = {"1.0.0", "1.1.0", "1.2.0"}
SINGLE_RECORD_SECTIONS = {"project", "project_default_style"}
TOP_LEVEL_ORDER = [
    "project",
    "chapters",
    "characters",
    "outlines",
    "relationships",
    "organizations",
    "organization_members",
    "writing_styles",
    "generation_history",
    "careers",
    "character_careers",
    "story_memories",
    "plot_analysis",
    "foreshadows",
    "project_default_style",
]
SECTION_PATHS = {
    "project": Path("project.md"),
    "project_default_style": Path("project-default-style.md"),
    "chapters": Path("chapters"),
    "characters": Path("characters"),
    "outlines": Path("outlines"),
    "relationships": Path("relationships"),
    "organizations": Path("organizations"),
    "organization_members": Path("organization-members"),
    "writing_styles": Path("writing-styles"),
    "generation_history": Path("generation-history"),
    "careers": Path("careers"),
    "character_careers": Path("character-careers"),
    "story_memories": Path("story-memories"),
    "plot_analysis": Path("plot-analysis"),
    "foreshadows": Path("foreshadows"),
}
SECTION_FILE_PREFIX = {
    "chapters": "ch",
    "characters": "char",
    "outlines": "out",
    "relationships": "rel",
    "organizations": "org",
    "organization_members": "member",
    "writing_styles": "style",
    "generation_history": "gen",
    "careers": "career",
    "character_careers": "charcareer",
    "story_memories": "memory",
    "plot_analysis": "analysis",
    "foreshadows": "fs",
}
TITLE_FIELDS = {
    "project": "title",
    "project_default_style": "style_name",
    "chapters": "title",
    "characters": "name",
    "outlines": "title",
    "relationships": "relationship_name",
    "organizations": "character_name",
    "organization_members": "character_name",
    "writing_styles": "name",
    "generation_history": "chapter_title",
    "careers": "name",
    "character_careers": "character_name",
    "story_memories": "title",
    "plot_analysis": "chapter_title",
    "foreshadows": "title",
}
ORDER_FIELDS = {
    "chapters": "chapter_number",
    "outlines": "order_index",
}
JSON_STRING_FIELDS = {
    "outlines": {"structure"},
    "careers": {"stages", "attribute_bonuses"},
}
FORCE_BODY_FIELDS = {
    "description",
    "content",
    "summary",
    "prompt",
    "generated_content",
    "personality",
    "background",
    "appearance",
    "relationships",
    "organization_members",
    "requirements",
    "special_abilities",
    "worldview_rules",
    "analysis_report",
    "world_time_period",
    "world_location",
    "world_atmosphere",
    "world_rules",
    "full_context",
    "notes",
}
BODY_FIELD_ORDER = {
    "project": [
        "description",
        "world_time_period",
        "world_location",
        "world_atmosphere",
        "world_rules",
    ],
    "chapters": ["summary", "content", "expansion_plan"],
    "characters": [
        "personality",
        "background",
        "appearance",
        "relationships",
        "traits",
        "organization_members",
        "sub_careers",
    ],
    "outlines": ["content", "structure"],
    "relationships": ["description"],
    "organizations": [],
    "organization_members": ["notes"],
    "writing_styles": ["description", "prompt_content"],
    "generation_history": ["prompt", "generated_content"],
    "careers": [
        "description",
        "requirements",
        "special_abilities",
        "worldview_rules",
        "stages",
        "attribute_bonuses",
    ],
    "character_careers": ["notes"],
    "story_memories": [
        "content",
        "full_context",
        "related_characters",
        "related_locations",
        "tags",
    ],
    "plot_analysis": [
        "conflict_types",
        "emotional_curve",
        "hooks",
        "foreshadows",
        "plot_points",
        "character_states",
        "scenes",
        "analysis_report",
        "suggestions",
    ],
    "foreshadows": [
        "content",
        "hint_text",
        "resolution_text",
        "notes",
        "resolution_notes",
    ],
    "project_default_style": [],
}
FIELD_MARKER_RE = re.compile(
    r"<!-- field:(?P<name>[a-zA-Z0-9_]+) type:(?P<kind>[a-z_]+) -->\n"
    r"(?P<content>.*?)\n<!-- /field -->",
    re.DOTALL,
)


@dataclass(frozen=True)
class ValidationSummary:
    valid: bool
    version: str
    project_name: str | None
    statistics: dict[str, int]
    errors: list[str]
    warnings: list[str]


def load_simple_env(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'").strip('"')
    return values


def default_base_url() -> str:
    env = load_simple_env(BACKEND_ROOT / ".env")
    host = env.get("APP_HOST", "127.0.0.1")
    if host in {"0.0.0.0", "::"}:
        host = "127.0.0.1"
    port = env.get("APP_PORT", "8000")
    return f"http://{host}:{port}"


def default_local_auth() -> tuple[str | None, str | None]:
    env = load_simple_env(BACKEND_ROOT / ".env")
    return env.get("LOCAL_AUTH_USERNAME"), env.get("LOCAL_AUTH_PASSWORD")


def decode_http_error(exc: urllib.error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace")
    except Exception:
        body = ""
    if body:
        try:
            payload = json.loads(body)
            if isinstance(payload, dict):
                detail = payload.get("detail") or payload.get("message")
                if detail:
                    return f"HTTP {exc.code}: {detail}"
        except json.JSONDecodeError:
            pass
        return f"HTTP {exc.code}: {body}"
    return f"HTTP {exc.code}: {exc.reason}"


class LocalAPIClient:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar)
        )

    def build_url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        return f"{self.base_url}{path}"

    def request_json(
        self,
        path: str,
        method: str = "GET",
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[Any, Any]:
        request_headers = {"Accept": "application/json"}
        if headers:
            request_headers.update(headers)

        data_bytes = None
        if payload is not None:
            data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json; charset=utf-8")

        request = urllib.request.Request(
            self.build_url(path),
            data=data_bytes,
            headers=request_headers,
            method=method,
        )
        try:
            with self.opener.open(request) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw), response.headers
        except urllib.error.HTTPError as exc:
            raise RuntimeError(decode_http_error(exc)) from exc

    def request_bytes(
        self,
        path: str,
        method: str = "GET",
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[bytes, Any]:
        request_headers = {}
        if headers:
            request_headers.update(headers)

        data_bytes = None
        if payload is not None:
            data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json; charset=utf-8")

        request = urllib.request.Request(
            self.build_url(path),
            data=data_bytes,
            headers=request_headers,
            method=method,
        )
        try:
            with self.opener.open(request) as response:
                return response.read(), response.headers
        except urllib.error.HTTPError as exc:
            raise RuntimeError(decode_http_error(exc)) from exc

    def upload_file_json(
        self,
        path: str,
        file_path: Path | str,
        field_name: str = "file",
    ) -> Any:
        file_path = Path(file_path)
        boundary = f"----MuMuBoundary{uuid.uuid4().hex}"
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/json"

        body = bytearray()

        def write_text(text: str) -> None:
            body.extend(text.encode("utf-8"))

        write_text(f"--{boundary}\r\n")
        write_text(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{file_path.name}"\r\n'
        )
        write_text(f"Content-Type: {content_type}\r\n\r\n")
        body.extend(file_path.read_bytes())
        write_text("\r\n")
        write_text(f"--{boundary}--\r\n")

        request = urllib.request.Request(
            self.build_url(path),
            data=bytes(body),
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with self.opener.open(request) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(decode_http_error(exc)) from exc

    def login(self) -> None:
        self.request_json(
            "/api/auth/local/login",
            method="POST",
            payload={"username": self.username, "password": self.password},
        )


def resolve_api_credentials(args: argparse.Namespace) -> tuple[str, str, str]:
    env_username, env_password = default_local_auth()
    base_url = args.base_url or default_base_url()
    username = args.username or env_username
    password = args.password or env_password
    if not username or not password:
        raise ValueError(
            "缺少本地登录凭据。请通过 --username/--password 传入，或在 backend/.env 中设置 LOCAL_AUTH_USERNAME / LOCAL_AUTH_PASSWORD。"
        )
    return base_url, username, password


def derive_export_filename(headers: Any, project_id: str) -> str:
    content_disposition = headers.get("Content-Disposition", "")
    match = re.search(r"filename\*=UTF-8''([^;]+)", content_disposition)
    if match:
        return urllib.parse.unquote(match.group(1))
    fallback = f"project_{project_id}.json"
    return fallback


def print_projects_table(items: list[dict[str, Any]]) -> None:
    if not items:
        print("没有找到项目。")
        return

    rows = []
    for item in items:
        rows.append({
            "id": item.get("id", ""),
            "title": item.get("title", ""),
            "status": item.get("status", ""),
            "chapters": str(item.get("chapter_count") or 0),
            "updated": str(item.get("updated_at") or ""),
        })

    widths = {
        "id": max(len("项目ID"), *(len(row["id"]) for row in rows)),
        "title": max(len("标题"), *(len(row["title"]) for row in rows)),
        "status": max(len("状态"), *(len(row["status"]) for row in rows)),
        "chapters": max(len("章节数"), *(len(row["chapters"]) for row in rows)),
        "updated": max(len("更新时间"), *(len(row["updated"]) for row in rows)),
    }

    header = (
        f"{'项目ID'.ljust(widths['id'])}  "
        f"{'标题'.ljust(widths['title'])}  "
        f"{'状态'.ljust(widths['status'])}  "
        f"{'章节数'.ljust(widths['chapters'])}  "
        f"{'更新时间'.ljust(widths['updated'])}"
    )
    print(header)
    print("-" * len(header))
    for row in rows:
        print(
            f"{row['id'].ljust(widths['id'])}  "
            f"{row['title'].ljust(widths['title'])}  "
            f"{row['status'].ljust(widths['status'])}  "
            f"{row['chapters'].ljust(widths['chapters'])}  "
            f"{row['updated'].ljust(widths['updated'])}"
        )


def sanitize_filename(value: str) -> str:
    cleaned = re.sub(r"[<>:\"/\\|?*]", "-", value)
    cleaned = re.sub(r"\s+", "-", cleaned.strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    cleaned = cleaned.strip(".- ")
    return cleaned or "untitled"


def compact_label(value: str, max_length: int = 24) -> str:
    label = sanitize_filename(value)
    if len(label) > max_length:
        label = label[:max_length].rstrip("-_. ")
    return label or "untitled"


def dump_toml_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, list):
        return "[" + ", ".join(dump_toml_value(item) for item in value) + "]"
    return json.dumps(value, ensure_ascii=False)


def build_frontmatter(data: dict[str, Any]) -> str:
    lines = ["+++"]
    for key, value in data.items():
        lines.append(f"{key} = {dump_toml_value(value)}")
    lines.append("+++")
    return "\n".join(lines)


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("+++\n"):
        raise ValueError("markdown file is missing TOML frontmatter")
    end = text.find("\n+++\n", 4)
    if end == -1:
        raise ValueError("markdown file has an unterminated TOML frontmatter block")
    frontmatter_text = text[4:end]
    body = text[end + 5 :]
    return tomllib.loads(frontmatter_text), body


def render_text_field(field_name: str, value: str) -> str:
    return (
        f"## {field_name}\n"
        f"<!-- field:{field_name} type:text -->\n"
        f"{value}\n"
        f"<!-- /field -->"
    )


def render_json_field(field_name: str, value: Any) -> str:
    json_body = json.dumps(value, ensure_ascii=False, indent=2)
    return (
        f"## {field_name}\n"
        f"<!-- field:{field_name} type:json -->\n"
        f"```json\n{json_body}\n```\n"
        f"<!-- /field -->"
    )


def render_json_string_field(field_name: str, value: str) -> str:
    return (
        f"## {field_name}\n"
        f"<!-- field:{field_name} type:json_string -->\n"
        f"```json\n{value}\n```\n"
        f"<!-- /field -->"
    )


def strip_json_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```json") and stripped.endswith("```"):
        stripped = stripped[7:-3]
    elif stripped.startswith("```") and stripped.endswith("```"):
        stripped = stripped[3:-3]
    return stripped.strip()


def parse_body_fields(body: str) -> dict[str, Any]:
    parsed: dict[str, Any] = {}
    for match in FIELD_MARKER_RE.finditer(body):
        name = match.group("name")
        kind = match.group("kind")
        content = match.group("content")
        if kind == "json":
            parsed[name] = json.loads(strip_json_fence(content))
        elif kind == "json_string":
            parsed[name] = strip_json_fence(content)
        elif kind == "text":
            parsed[name] = content
        else:
            raise ValueError(f"unsupported field kind: {kind}")
    return parsed


def is_json_string(section: str, field_name: str, value: Any) -> bool:
    return field_name in JSON_STRING_FIELDS.get(section, set()) and isinstance(value, str)


def should_use_body(section: str, field_name: str, value: Any) -> bool:
    if field_name in FORCE_BODY_FIELDS:
        return True
    if isinstance(value, (dict, list)):
        return True
    if is_json_string(section, field_name, value):
        return True
    if isinstance(value, str) and ("\n" in value or len(value) > 120):
        return True
    return False


def ordered_fields(section: str, record: dict[str, Any]) -> list[str]:
    preferred = BODY_FIELD_ORDER.get(section, [])
    remaining = [key for key in record.keys() if key not in preferred]
    return [key for key in preferred if key in record] + remaining


def build_record_label(section: str, record: dict[str, Any]) -> str:
    if section == "relationships":
        parts = [
            record.get("source_name"),
            record.get("target_name"),
            record.get("relationship_name"),
        ]
    elif section == "organization_members":
        parts = [
            record.get("organization_name"),
            record.get("character_name"),
            record.get("position"),
        ]
    elif section == "generation_history":
        parts = [
            record.get("chapter_title"),
            record.get("model"),
        ]
    elif section == "careers":
        parts = [
            record.get("type"),
            record.get("name"),
        ]
    elif section == "character_careers":
        parts = [
            record.get("character_name"),
            record.get("career_name"),
        ]
    elif section == "story_memories":
        parts = [
            record.get("title"),
            record.get("chapter_title"),
            record.get("memory_type"),
        ]
    else:
        title_field = TITLE_FIELDS.get(section)
        parts = [record.get(title_field)] if title_field else []

    text = "-".join(str(part) for part in parts if part)
    return compact_label(text)


def build_record_markdown(section: str, record: dict[str, Any], index: int) -> str:
    title_field = TITLE_FIELDS.get(section)
    title = record.get(title_field) if title_field else None

    frontmatter: dict[str, Any] = {
        "section": section,
        "index": index,
    }
    if title_field:
        frontmatter["title_field"] = title_field

    body_chunks: list[str] = []
    body_fields: list[str] = []
    json_fields: list[str] = []
    json_string_fields: list[str] = []

    for field_name in ordered_fields(section, record):
        value = record[field_name]
        if value is None:
            continue
        if should_use_body(section, field_name, value):
            body_fields.append(field_name)
            if is_json_string(section, field_name, value):
                json_string_fields.append(field_name)
                body_chunks.append(render_json_string_field(field_name, value))
            elif isinstance(value, (list, dict)):
                json_fields.append(field_name)
                body_chunks.append(render_json_field(field_name, value))
            else:
                body_chunks.append(render_text_field(field_name, str(value)))
        else:
            frontmatter[field_name] = value

    if body_fields:
        frontmatter["body_fields"] = body_fields
    if json_fields:
        frontmatter["json_fields"] = json_fields
    if json_string_fields:
        frontmatter["json_string_fields"] = json_string_fields

    parts = [build_frontmatter(frontmatter)]
    if title:
        parts.append(f"# {title}")
    else:
        parts.append(f"# {section}")
    if body_chunks:
        parts.extend(body_chunks)
    return "\n\n".join(parts).rstrip() + "\n"


def record_filename(section: str, record: dict[str, Any], index: int) -> str:
    prefix = SECTION_FILE_PREFIX.get(section, section)
    label = build_record_label(section, record)
    return f"{prefix}-{index:03d}-{label}.md"


def build_section_index_line(section: str, file_name: str, index: int, record: dict[str, Any]) -> str:
    title_field = TITLE_FIELDS.get(section)
    title = record.get(title_field) if title_field else None
    details: list[str] = []
    if title:
        details.append(f"title={title}")
    order_field = ORDER_FIELDS.get(section)
    if order_field and record.get(order_field) is not None:
        details.append(f"{order_field}={record.get(order_field)}")
    if section == "careers" and record.get("type"):
        details.append(f"type={record.get('type')}")
    if section == "character_careers":
        if record.get("career_name"):
            details.append(f"career={record.get('career_name')}")
        if record.get("career_type"):
            details.append(f"type={record.get('career_type')}")
    if section == "relationships":
        details.append(f"from={record.get('source_name')}")
        details.append(f"to={record.get('target_name')}")
    if section == "organization_members":
        details.append(f"organization={record.get('organization_name')}")
    if section == "generation_history" and record.get("model"):
        details.append(f"model={record.get('model')}")
    return f"- `{file_name}`: " + " | ".join(str(item) for item in details if item)


def write_section_index(section: str, target_dir: Path, records: list[dict[str, Any]], file_names: list[str]) -> None:
    lines = [f"# {section}", ""]
    for index, (record, file_name) in enumerate(zip(records, file_names), start=1):
        lines.append(build_section_index_line(section, file_name, index, record))
    lines.append("")
    (target_dir / "_index.md").write_text("\n".join(lines), encoding="utf-8")


def build_generic_readme_text() -> str:
    return textwrap.dedent(
        """\
        # MuMu Workspace 使用说明

        这套工作流用于把 MuMuAINovel 的项目导出 JSON 转成适合 Claude Code 编辑的 Markdown 工作区，再从 Markdown 回转成可重新导入的 JSON。

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

        如果你不想打开前端页面，也可以直接用同一个脚本列项目、导出、导入。

        ## 后端直连命令

        ```powershell
        python tools/mumu_workspace.py list-projects
        python tools/mumu_workspace.py export-project <project_id> output.json
        python tools/mumu_workspace.py import-project output.json
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
        ```

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

        ## 格式约定

        - 每个 Markdown 文件都有 TOML frontmatter。
        - 长文本字段会展开为正文块。
        - 结构化数据会保留为 JSON 代码块。
        - 一些原本就是“JSON 字符串”的字段会以高保真方式保存，保证 `json -> md -> json` 尽量不失真。

        ## 校验说明

        `validate` 支持两种输入：

        - 原始导出 JSON
        - Markdown 工作区目录

        在 `md-to-json` 之前先跑一次 `validate`，可以更早发现字段缺失、类型错误或结构损坏。

        ## 书籍 ID 说明

        - `list-projects` 会直接打印项目 ID，便于定位书籍。
        - `export-project` 导出的 JSON 顶层会额外包含 `source_project_id`。
        - 生成的工作区元数据 `.mumu-workspace.toml` 也会保留这个来源项目 ID。
        """
    )


def write_workspace_readme(output_dir: Path, data: dict[str, Any]) -> None:
    _ = data
    (output_dir / "README.md").write_text(build_generic_readme_text() + "\n", encoding="utf-8")


def write_workspace_meta(output_dir: Path, source_json: Path, data: dict[str, Any]) -> None:
    meta = {
        "workspace_format": "mumu-markdown-v1",
        "source_json": str(source_json),
        "version": data.get("version", ""),
        "export_time": data.get("export_time", ""),
        "source_project_id": data.get("source_project_id"),
        "sections": [section for section in TOP_LEVEL_ORDER if section in data],
    }
    (output_dir / ".mumu-workspace.toml").write_text(
        build_frontmatter(meta) + "\n",
        encoding="utf-8",
    )


def export_json_to_workspace(input_json: Path, output_dir: Path, force: bool) -> Path:
    data = json.loads(input_json.read_text(encoding="utf-8"))
    validation = validate_export_dict(data)
    if not validation.valid:
        raise ValueError("input JSON is not a valid MuMuAINovel export")

    if output_dir.exists():
        if not force:
            raise FileExistsError(f"output directory already exists: {output_dir}")
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    write_workspace_meta(output_dir, input_json, data)
    write_workspace_readme(output_dir, data)

    for section in TOP_LEVEL_ORDER:
        if section not in data:
            continue
        section_value = data[section]
        target = output_dir / SECTION_PATHS[section]

        if section in SINGLE_RECORD_SECTIONS:
            if section_value:
                markdown = build_record_markdown(section, section_value, 1)
                target.write_text(markdown, encoding="utf-8")
            continue

        target.mkdir(parents=True, exist_ok=True)
        file_names: list[str] = []
        for index, record in enumerate(section_value, start=1):
            file_name = record_filename(section, record, index)
            file_names.append(file_name)
            file_path = target / file_name
            file_path.write_text(build_record_markdown(section, record, index), encoding="utf-8")
        write_section_index(section, target, section_value, file_names)

    return output_dir


def read_workspace_meta(workspace_dir: Path) -> dict[str, Any]:
    meta_file = workspace_dir / ".mumu-workspace.toml"
    if not meta_file.exists():
        raise FileNotFoundError(f"missing workspace meta file: {meta_file}")
    meta, _ = parse_frontmatter(meta_file.read_text(encoding="utf-8"))
    return meta


def parse_record_markdown(file_path: Path) -> dict[str, Any]:
    frontmatter, body = parse_frontmatter(file_path.read_text(encoding="utf-8"))
    record: dict[str, Any] = {}
    for key, value in frontmatter.items():
        if key in {"section", "index", "title_field", "body_fields", "json_fields", "json_string_fields"}:
            continue
        record[key] = value

    body_data = parse_body_fields(body)
    json_string_fields = set(frontmatter.get("json_string_fields", []))
    for field_name, value in body_data.items():
        if field_name in json_string_fields:
            record[field_name] = value
        else:
            record[field_name] = value
    return record


def workspace_to_export_dict(workspace_dir: Path) -> dict[str, Any]:
    meta = read_workspace_meta(workspace_dir)
    data: dict[str, Any] = {
        "version": meta.get("version", ""),
        "export_time": meta.get("export_time", ""),
    }
    if meta.get("source_project_id"):
        data["source_project_id"] = meta.get("source_project_id")

    for section in TOP_LEVEL_ORDER:
        path = workspace_dir / SECTION_PATHS[section]
        if section in SINGLE_RECORD_SECTIONS:
            if path.exists():
                data[section] = parse_record_markdown(path)
            elif section == "project":
                raise FileNotFoundError(f"missing required file: {path}")
            else:
                data[section] = None
            continue

        if not path.exists():
            data[section] = []
            continue
        files = sorted(
            file_path
            for file_path in path.glob("*.md")
            if not file_path.name.startswith("_")
        )
        data[section] = [parse_record_markdown(file_path) for file_path in files]

    return data


def write_export_json(output_json: Path, data: dict[str, Any]) -> None:
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def validate_export_dict(data: dict[str, Any]) -> ValidationSummary:
    errors: list[str] = []
    warnings: list[str] = []

    try:
        ProjectExportData.model_validate(data)
    except ValidationError as exc:
        for issue in exc.errors():
            location = ".".join(str(item) for item in issue.get("loc", ()))
            message = issue.get("msg", "validation error")
            errors.append(f"{location}: {message}")

    version = data.get("version", "")
    if not version:
        errors.append("missing version")
    elif version not in SUPPORTED_VERSIONS:
        warnings.append(
            f"version mismatch: {version} not in supported versions {sorted(SUPPORTED_VERSIONS)}"
        )

    project = data.get("project")
    if not project:
        errors.append("missing project")
    elif not project.get("title"):
        errors.append("project.title must not be empty")

    statistics = {
        "chapters": len(data.get("chapters", [])),
        "characters": len(data.get("characters", [])),
        "outlines": len(data.get("outlines", [])),
        "relationships": len(data.get("relationships", [])),
        "organizations": len(data.get("organizations", [])),
        "organization_members": len(data.get("organization_members", [])),
        "writing_styles": len(data.get("writing_styles", [])),
        "generation_history": len(data.get("generation_history", [])),
        "careers": len(data.get("careers", [])),
        "character_careers": len(data.get("character_careers", [])),
        "story_memories": len(data.get("story_memories", [])),
        "plot_analysis": len(data.get("plot_analysis", [])),
        "foreshadows": len(data.get("foreshadows", [])),
        "has_default_style": 1 if data.get("project_default_style") else 0,
    }

    if statistics["chapters"] == 0:
        warnings.append("project has no chapter data")
    if statistics["characters"] == 0:
        warnings.append("project has no character data")

    return ValidationSummary(
        valid=not errors,
        version=version,
        project_name=(project or {}).get("title"),
        statistics=statistics,
        errors=errors,
        warnings=warnings,
    )


def print_validation(summary: ValidationSummary, source: str) -> None:
    print(f"source: {source}")
    print(f"valid: {summary.valid}")
    print(f"version: {summary.version}")
    print(f"project_name: {summary.project_name}")
    print("statistics:")
    for key, value in summary.statistics.items():
        print(f"  - {key}: {value}")
    if summary.warnings:
        print("warnings:")
        for warning in summary.warnings:
            print(f"  - {warning}")
    if summary.errors:
        print("errors:")
        for error in summary.errors:
            print(f"  - {error}")


def default_workspace_dir(input_json: Path) -> Path:
    stem = sanitize_filename(input_json.stem)
    return REPO_ROOT / "workspace" / stem


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MuMuAINovel JSON/Markdown workspace tools")
    subparsers = parser.add_subparsers(dest="command", required=True)

    json_to_md = subparsers.add_parser("json-to-md", help="convert export JSON into a Markdown workspace")
    json_to_md.add_argument("input_json", type=Path)
    json_to_md.add_argument("output_dir", type=Path, nargs="?")
    json_to_md.add_argument("--force", action="store_true")

    md_to_json = subparsers.add_parser("md-to-json", help="convert a Markdown workspace back to export JSON")
    md_to_json.add_argument("workspace_dir", type=Path)
    md_to_json.add_argument("output_json", type=Path)

    validate = subparsers.add_parser("validate", help="validate either export JSON or a Markdown workspace")
    validate.add_argument("path", type=Path)

    list_projects = subparsers.add_parser("list-projects", help="list projects from the local MuMuAINovel backend")
    list_projects.add_argument("--base-url", default=None, help="backend base URL, default reads backend/.env")
    list_projects.add_argument("--username", default=None, help="local auth username, default reads backend/.env")
    list_projects.add_argument("--password", default=None, help="local auth password, default reads backend/.env")

    export_project = subparsers.add_parser("export-project", help="export a project directly from the local backend by project id")
    export_project.add_argument("project_id", help="MuMuAINovel project id")
    export_project.add_argument("output_json", type=Path, nargs="?", help="optional output path")
    export_project.add_argument("--base-url", default=None, help="backend base URL, default reads backend/.env")
    export_project.add_argument("--username", default=None, help="local auth username, default reads backend/.env")
    export_project.add_argument("--password", default=None, help="local auth password, default reads backend/.env")
    export_project.add_argument("--include-generation-history", action="store_true", help="include generation history")
    export_project.add_argument("--include-memories", action="store_true", help="include story memories")
    export_project.add_argument("--include-plot-analysis", action="store_true", help="include plot analysis")
    export_project.add_argument("--no-writing-styles", action="store_true", help="exclude writing styles")
    export_project.add_argument("--no-careers", action="store_true", help="exclude careers")
    export_project.add_argument("--no-foreshadows", action="store_true", help="exclude foreshadows")

    import_project = subparsers.add_parser("import-project", help="import a project JSON directly into the local backend")
    import_project.add_argument("input_json", type=Path)
    import_project.add_argument("--base-url", default=None, help="backend base URL, default reads backend/.env")
    import_project.add_argument("--username", default=None, help="local auth username, default reads backend/.env")
    import_project.add_argument("--password", default=None, help="local auth password, default reads backend/.env")
    import_project.add_argument("--skip-validate", action="store_true", help="skip calling /validate-import before import")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "json-to-md":
        input_json = args.input_json.resolve()
        output_dir = args.output_dir.resolve() if args.output_dir else default_workspace_dir(input_json)
        workspace_dir = export_json_to_workspace(input_json, output_dir, force=args.force)
        summary = validate_export_dict(json.loads(input_json.read_text(encoding="utf-8")))
        print_validation(summary, str(input_json))
        print(f"workspace_dir: {workspace_dir}")
        return 0

    if args.command == "md-to-json":
        workspace_dir = args.workspace_dir.resolve()
        output_json = args.output_json.resolve()
        data = workspace_to_export_dict(workspace_dir)
        summary = validate_export_dict(data)
        if not summary.valid:
            print_validation(summary, str(workspace_dir))
            return 1
        write_export_json(output_json, data)
        print_validation(summary, str(workspace_dir))
        print(f"output_json: {output_json}")
        return 0

    if args.command == "validate":
        path = args.path.resolve()
        if path.is_dir():
            summary = validate_export_dict(workspace_to_export_dict(path))
        else:
            summary = validate_export_dict(json.loads(path.read_text(encoding="utf-8")))
        print_validation(summary, str(path))
        return 0 if summary.valid else 1

    if args.command == "list-projects":
        base_url, username, password = resolve_api_credentials(args)
        client = LocalAPIClient(base_url, username, password)
        client.login()
        payload, _ = client.request_json("/api/projects", method="GET")
        print_projects_table(payload.get("items", []))
        return 0

    if args.command == "export-project":
        base_url, username, password = resolve_api_credentials(args)
        client = LocalAPIClient(base_url, username, password)
        client.login()
        export_options = {
            "include_generation_history": bool(args.include_generation_history),
            "include_writing_styles": not bool(args.no_writing_styles),
            "include_careers": not bool(args.no_careers),
            "include_memories": bool(args.include_memories),
            "include_plot_analysis": bool(args.include_plot_analysis),
            "include_foreshadows": not bool(args.no_foreshadows),
        }
        content, headers = client.request_bytes(
            f"/api/projects/{args.project_id}/export-data",
            method="POST",
            payload=export_options,
        )
        output_path = args.output_json.resolve() if args.output_json else (REPO_ROOT / derive_export_filename(headers, args.project_id))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(content)
        data = json.loads(content.decode("utf-8"))
        print(f"已导出到: {output_path}")
        print(f"source_project_id: {data.get('source_project_id')}")
        return 0

    if args.command == "import-project":
        input_json = args.input_json.resolve()
        base_url, username, password = resolve_api_credentials(args)
        client = LocalAPIClient(base_url, username, password)
        client.login()

        if not args.skip_validate:
            validation = client.upload_file_json("/api/projects/validate-import", input_json)
            print("导入前校验结果:")
            print(json.dumps(validation, ensure_ascii=False, indent=2))
            if not validation.get("valid"):
                return 1

        result = client.upload_file_json("/api/projects/import", input_json)
        print("导入结果:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("success") else 1

    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
