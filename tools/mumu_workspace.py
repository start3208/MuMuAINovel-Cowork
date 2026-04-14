from __future__ import annotations

import argparse
import copy
import http.cookiejar
import json
import mimetypes
import re
import shutil
import sys
import tempfile
import textwrap
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from types import UnionType
from typing import Any, Literal, Union, get_args, get_origin

import tomllib


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from pydantic import BaseModel, ConfigDict, ValidationError  # type: ignore
from app.schemas.career import CareerStage  # type: ignore
from app.schemas.import_export import (  # type: ignore
    ChapterExportData,
    CharacterCareerExportData,
    CharacterExportData,
    ForeshadowExportData,
    GenerationHistoryExportData,
    OrganizationExportData,
    OrganizationMemberExportData,
    OutlineExportData,
    PlotAnalysisExportData,
    ProjectDefaultStyleExportData,
    ProjectExportData,
    RelationshipExportData,
    StoryMemoryExportData,
    WritingStyleExportData,
    CareerExportData,
)  


SUPPORTED_VERSIONS = {"1.0.0", "1.1.0", "1.2.0"}
SINGLE_RECORD_SECTIONS = {"project", "project_default_style"}
GROUPED_RECORD_SECTIONS = {"story_memories", "character_careers", "organization_members", "relationships"}
WORKSPACE_RESERVED_PREFIXES = (".", "_")
WORKSPACE_EXCLUDED_ROOT_NAMES = {"backups"}
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
WORKSPACE_MANAGED_ROOT_FILES = {
    Path("README.md"),
    Path(".mumu-workspace.toml"),
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

TOP_LEVEL_FIELD_DEFAULTS = {
    "version": "1.2.0",
    "export_time": "",
    "source_project_id": "",
}
PROJECT_ALLOWED_FIELDS = [
    "title",
    "description",
    "theme",
    "genre",
    "target_words",
    "current_words",
    "status",
    "world_time_period",
    "world_location",
    "world_atmosphere",
    "world_rules",
    "chapter_count",
    "narrative_perspective",
    "character_count",
    "outline_mode",
    "user_id",
    "created_at",
]
PROJECT_FIELD_DEFAULTS = {
    "title": "",
    "description": "",
    "theme": "",
    "genre": "",
    "target_words": 0,
    "current_words": 0,
    "status": "",
    "world_time_period": "",
    "world_location": "",
    "world_atmosphere": "",
    "world_rules": "",
    "chapter_count": 0,
    "narrative_perspective": "",
    "character_count": 0,
    "outline_mode": "",
    "user_id": "",
    "created_at": "",
}
SECTION_MODEL_MAP = {
    "chapters": ChapterExportData,
    "characters": CharacterExportData,
    "outlines": OutlineExportData,
    "relationships": RelationshipExportData,
    "organizations": OrganizationExportData,
    "organization_members": OrganizationMemberExportData,
    "writing_styles": WritingStyleExportData,
    "generation_history": GenerationHistoryExportData,
    "careers": CareerExportData,
    "character_careers": CharacterCareerExportData,
    "story_memories": StoryMemoryExportData,
    "plot_analysis": PlotAnalysisExportData,
    "foreshadows": ForeshadowExportData,
    "project_default_style": ProjectDefaultStyleExportData,
}


class OutlineStructureCharacterModel(BaseModel):
    name: str
    type: Literal["character", "organization"]

    model_config = ConfigDict(extra="forbid")


class OutlineStructureSceneModel(BaseModel):
    location: str
    characters: list[str]
    purpose: str

    model_config = ConfigDict(extra="forbid")


class OutlineStructureModel(BaseModel):
    title: str
    summary: str
    content: str
    characters: list[OutlineStructureCharacterModel]
    scenes: list[str] | list[OutlineStructureSceneModel]
    key_points: list[str]
    key_events: list[str]
    emotion: str
    goal: str

    model_config = ConfigDict(extra="forbid")


@dataclass(frozen=True)
class ValidationSummary:
    valid: bool
    version: str
    project_name: str | None
    statistics: dict[str, int]
    errors: list[str]
    warnings: list[str]


@dataclass
class MaterializedInput:
    json_path: Path
    data: dict[str, Any]
    temporary: bool = False


def unwrap_optional(annotation: Any) -> Any:
    origin = get_origin(annotation)
    if origin is None:
        return annotation
    if origin not in (Union, UnionType):
        return annotation
    args = [arg for arg in get_args(annotation) if arg is not type(None)]
    if len(args) == 1:
        return args[0]
    return annotation


def default_for_annotation(annotation: Any) -> Any:
    annotation = unwrap_optional(annotation)
    origin = get_origin(annotation)

    if origin in (list, tuple, set, frozenset):
        return []
    if origin is dict:
        return {}

    if annotation is str:
        return ""
    if annotation is int:
        return 0
    if annotation is float:
        return 0.0
    if annotation is bool:
        return False

    return ""


def default_for_model_field(field: Any) -> Any:
    if field.default_factory is not None:
        return field.default_factory()
    if field.default is not None and str(field.default) != "PydanticUndefined":
        return copy.deepcopy(field.default)
    return default_for_annotation(field.annotation)


def normalize_value_for_annotation(annotation: Any, value: Any) -> Any:
    annotation = unwrap_optional(annotation)
    origin = get_origin(annotation)

    if value is None:
        return default_for_annotation(annotation)

    if origin in (list, tuple, set, frozenset):
        if value == "":
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            try:
                parsed = json.loads(stripped)
                return parsed if isinstance(parsed, list) else []
            except json.JSONDecodeError:
                return [item.strip() for item in re.split(r"[，,、\n]", value) if item.strip()]
        return []

    if origin is dict:
        if value == "":
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return {}
            try:
                parsed = json.loads(stripped)
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                return {}
        return {}

    if annotation is str:
        return "" if value is None else str(value)
    if annotation is int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0
    if annotation is float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0
    if annotation is bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(value)

    return value


def normalize_project_dict(project: dict[str, Any] | None) -> tuple[dict[str, Any], list[str]]:
    project = project or {}
    errors: list[str] = []
    extra_keys = sorted(set(project.keys()) - set(PROJECT_ALLOWED_FIELDS))
    for key in extra_keys:
        errors.append(f"project.{key}: extra field is not allowed")

    normalized: dict[str, Any] = {}
    for key in PROJECT_ALLOWED_FIELDS:
        normalized[key] = copy.deepcopy(project.get(key, PROJECT_FIELD_DEFAULTS[key]))
    return normalized, errors


def normalize_model_record(section: str, record: dict[str, Any] | None) -> tuple[dict[str, Any], list[str]]:
    model = SECTION_MODEL_MAP[section]
    record = record or {}
    errors: list[str] = []

    allowed_fields = set(model.model_fields.keys())
    extra_keys = sorted(set(record.keys()) - allowed_fields)
    for key in extra_keys:
        errors.append(f"{section}.{key}: extra field is not allowed")

    normalized: dict[str, Any] = {}
    for name, field in model.model_fields.items():
        if name in record:
            normalized[name] = normalize_value_for_annotation(field.annotation, copy.deepcopy(record[name]))
        else:
            normalized[name] = default_for_model_field(field)
    return normalized, errors


def normalize_export_dict(data: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    normalized: dict[str, Any] = {}

    allowed_top_level = set(TOP_LEVEL_FIELD_DEFAULTS.keys()) | set(TOP_LEVEL_ORDER)
    extra_top_level = sorted(set(data.keys()) - allowed_top_level)
    for key in extra_top_level:
        errors.append(f"{key}: extra top-level field is not allowed")

    for key, default_value in TOP_LEVEL_FIELD_DEFAULTS.items():
        normalized[key] = copy.deepcopy(data.get(key, default_value))

    project_normalized, project_errors = normalize_project_dict(data.get("project"))
    normalized["project"] = project_normalized
    errors.extend(project_errors)

    for section in TOP_LEVEL_ORDER:
        if section == "project":
            continue
        if section in SINGLE_RECORD_SECTIONS:
            section_normalized, section_errors = normalize_model_record(section, data.get(section))
            normalized[section] = section_normalized
            errors.extend(section_errors)
            continue

        source_records = data.get(section)
        if not isinstance(source_records, list):
            source_records = []
        normalized_records = []
        for index, record in enumerate(source_records):
            record_normalized, record_errors = normalize_model_record(section, record)
            normalized_records.append(record_normalized)
            for error in record_errors:
                suffix = error.split(".", 1)[-1]
                errors.append(f"{section}[{index}].{suffix}")
        normalized[section] = normalized_records

    return normalized, errors


def validate_json_string_field(section: str, field_name: str, value: Any) -> list[str]:
    if not isinstance(value, str):
        return [f"{section}.{field_name}: expected JSON string"]

    stripped = value.strip()
    if not stripped:
        if section == "careers" and field_name == "stages":
            return [f"{section}.{field_name}: JSON string must not be empty"]
        return []

    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        return [f"{section}.{field_name}: invalid JSON string ({exc.msg})"]

    try:
        if section == "outlines" and field_name == "structure":
            OutlineStructureModel.model_validate(parsed)
        elif section == "careers" and field_name == "stages":
            if not isinstance(parsed, list):
                return [f"{section}.{field_name}: expected JSON array"]
            for index, item in enumerate(parsed):
                CareerStage.model_validate(item)
        elif section == "careers" and field_name == "attribute_bonuses":
            if not isinstance(parsed, dict):
                return [f"{section}.{field_name}: expected JSON object"]
            for key, item in parsed.items():
                if not isinstance(key, str) or not isinstance(item, str):
                    return [f"{section}.{field_name}: expected object<string, string>"]
    except ValidationError as exc:
        errors: list[str] = []
        for issue in exc.errors():
            location = ".".join(str(item) for item in issue.get("loc", ()))
            prefix = f"{section}.{field_name}"
            errors.append(f"{prefix}.{location}: {issue.get('msg', 'validation error')}" if location else f"{prefix}: {issue.get('msg', 'validation error')}")
        return errors

    return []


def strict_validate_project_dict(project: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(project, dict):
        return ["project: expected object"]

    extra_keys = sorted(set(project.keys()) - set(PROJECT_ALLOWED_FIELDS))
    for key in extra_keys:
        errors.append(f"project.{key}: extra field is not allowed")

    missing_keys = [key for key in PROJECT_ALLOWED_FIELDS if key not in project]
    for key in missing_keys:
        errors.append(f"project.{key}: missing field")

    return errors


def strict_validate_model_record(section: str, record: Any, prefix: str) -> list[str]:
    model = SECTION_MODEL_MAP[section]
    errors: list[str] = []
    if not isinstance(record, dict):
        return [f"{prefix}: expected object"]

    allowed_fields = set(model.model_fields.keys())
    extra_keys = sorted(set(record.keys()) - allowed_fields)
    for key in extra_keys:
        errors.append(f"{prefix}.{key}: extra field is not allowed")

    missing_keys = [key for key in model.model_fields.keys() if key not in record]
    for key in missing_keys:
        errors.append(f"{prefix}.{key}: missing field")

    try:
        model.model_validate(record)
    except ValidationError as exc:
        for issue in exc.errors():
            location = ".".join(str(item) for item in issue.get("loc", ()))
            errors.append(f"{prefix}.{location}: {issue.get('msg', 'validation error')}" if location else f"{prefix}: {issue.get('msg', 'validation error')}")

    for field_name in JSON_STRING_FIELDS.get(section, set()):
        if field_name not in record:
            continue
        for error in validate_json_string_field(section, field_name, record[field_name]):
            suffix = error.split(".", 1)[-1] if error.startswith(f"{section}.") else error
            if prefix != section:
                errors.append(f"{prefix}.{suffix}")
            else:
                errors.append(error)

    return errors


def collect_strict_schema_errors(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    allowed_top_level = set(TOP_LEVEL_FIELD_DEFAULTS.keys()) | set(TOP_LEVEL_ORDER)
    extra_top_level = sorted(set(data.keys()) - allowed_top_level)
    for key in extra_top_level:
        errors.append(f"{key}: extra top-level field is not allowed")

    missing_top_level = [key for key in [*TOP_LEVEL_FIELD_DEFAULTS.keys(), *TOP_LEVEL_ORDER] if key not in data]
    for key in missing_top_level:
        errors.append(f"{key}: missing top-level field")

    if "project" in data:
        errors.extend(strict_validate_project_dict(data.get("project")))

    for section in TOP_LEVEL_ORDER:
        if section == "project" or section not in data:
            continue
        section_value = data.get(section)
        if section in SINGLE_RECORD_SECTIONS:
            if section_value is None:
                continue
            errors.extend(strict_validate_model_record(section, section_value, section))
            continue

        if not isinstance(section_value, list):
            errors.append(f"{section}: expected array")
            continue
        for index, record in enumerate(section_value):
            errors.extend(strict_validate_model_record(section, record, f"{section}[{index}]"))

    return errors


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

    def _open_with_retry(self, request: urllib.request.Request):
        attempts = 5
        delay = 0.6
        last_error: Exception | None = None
        for _ in range(attempts):
            try:
                return self.opener.open(request)
            except urllib.error.URLError as exc:
                last_error = exc
                time.sleep(delay)
        if last_error:
            raise last_error
        raise RuntimeError("request failed without an explicit error")

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
            with self._open_with_retry(request) as response:
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
            with self._open_with_retry(request) as response:
                return response.read(), response.headers
        except urllib.error.HTTPError as exc:
            raise RuntimeError(decode_http_error(exc)) from exc

    def upload_file_json(
        self,
        path: str,
        file_path: Path | str,
        field_name: str = "file",
        fields: dict[str, Any] | None = None,
    ) -> Any:
        file_path = Path(file_path)
        boundary = f"----MuMuBoundary{uuid.uuid4().hex}"
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/json"

        body = bytearray()

        def write_text(text: str) -> None:
            body.extend(text.encode("utf-8"))

        if fields:
            for key, value in fields.items():
                write_text(f"--{boundary}\r\n")
                write_text(f'Content-Disposition: form-data; name="{key}"\r\n\r\n')
                write_text(f"{value}\r\n")

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
            with self._open_with_retry(request) as response:
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


def materialize_input(input_path: Path) -> MaterializedInput:
    input_path = input_path.resolve()
    if input_path.is_dir():
        data = workspace_to_export_dict(input_path)
        summary = validate_export_dict(data)
        if not summary.valid:
            raise ValueError("工作区校验失败，无法继续上传或同步")
        temp_dir = REPO_ROOT / "workspace" / ".tmp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_file = Path(
            tempfile.mkstemp(prefix="mumu-upload-", suffix=".json", dir=str(temp_dir))[1]
        )
        write_export_json(temp_file, data)
        return MaterializedInput(json_path=temp_file, data=data, temporary=True)

    data = json.loads(input_path.read_text(encoding="utf-8"))
    summary = validate_export_dict(data)
    if not summary.valid:
        raise ValueError("JSON 校验失败，无法继续上传或同步")
    return MaterializedInput(json_path=input_path, data=data, temporary=False)


def cleanup_materialized_input(materialized: MaterializedInput) -> None:
    if materialized.temporary and materialized.json_path.exists():
        try:
            materialized.json_path.unlink()
        except PermissionError:
            # Windows 下上传请求刚结束时文件句柄可能仍在释放中，留给后续清理即可。
            pass


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


def is_reserved_workspace_name(name: str) -> bool:
    return bool(name) and name.startswith(WORKSPACE_RESERVED_PREFIXES)


def is_workspace_directory(path: Path) -> bool:
    return (
        path.is_dir()
        and not is_reserved_workspace_name(path.name)
        and path.name not in WORKSPACE_EXCLUDED_ROOT_NAMES
        and (path / ".mumu-workspace.toml").exists()
    )


def nested_workspace_directories(container_dir: Path) -> list[Path]:
    if not container_dir.exists() or not container_dir.is_dir():
        return []
    return sorted(
        child
        for child in container_dir.iterdir()
        if is_workspace_directory(child)
    )


def is_workspace_container_directory(path: Path) -> bool:
    if not path.is_dir():
        return False
    if is_reserved_workspace_name(path.name) or path.name in WORKSPACE_EXCLUDED_ROOT_NAMES:
        return False
    if is_workspace_directory(path):
        return True
    return len(nested_workspace_directories(path)) == 1


def resolve_workspace_data_dir(workspace_path: Path) -> Path:
    if is_workspace_directory(workspace_path):
        return workspace_path

    nested_dirs = nested_workspace_directories(workspace_path)
    if len(nested_dirs) == 1:
        return nested_dirs[0]
    if len(nested_dirs) > 1:
        raise ValueError(
            f"workspace container contains multiple nested workspace directories: {workspace_path}"
        )
    raise FileNotFoundError(f"workspace meta file not found under: {workspace_path}")


def workspace_project_dir_name(project_title: str | None, fallback_name: str = "project") -> str:
    raw_name = (project_title or "").strip() or fallback_name
    name = sanitize_filename(raw_name)
    if is_reserved_workspace_name(name):
        name = name.lstrip("._ ")
    return name or fallback_name


def resolve_workspace_export_target(output_dir: Path, project_title: str | None) -> Path:
    nested_target = output_dir / workspace_project_dir_name(project_title)
    if not output_dir.exists():
        return nested_target

    if is_workspace_directory(output_dir):
        return output_dir

    nested_dirs = nested_workspace_directories(output_dir)
    if len(nested_dirs) == 1:
        return nested_dirs[0]

    return nested_target


def managed_workspace_paths() -> list[Path]:
    return [*WORKSPACE_MANAGED_ROOT_FILES, *(SECTION_PATHS[section] for section in TOP_LEVEL_ORDER)]


def clear_managed_workspace_paths(output_dir: Path) -> None:
    for relative_path in managed_workspace_paths():
        target = output_dir / relative_path
        if target.is_dir():
            shutil.rmtree(target)
        elif target.is_file() or target.is_symlink():
            target.unlink()


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
    if section == "story_memories":
        if record.get("chapter_title"):
            details.append(f"chapter={record.get('chapter_title')}")
        if record.get("memory_type"):
            details.append(f"type={record.get('memory_type')}")
    return f"- `{file_name}`: " + " | ".join(str(item) for item in details if item)


def write_section_index(section: str, target_dir: Path, records: list[dict[str, Any]], file_names: list[str]) -> None:
    lines = [f"# {section}", ""]
    for index, (record, file_name) in enumerate(zip(records, file_names), start=1):
        lines.append(build_section_index_line(section, file_name, index, record))
    lines.append("")
    (target_dir / "_index.md").write_text("\n".join(lines), encoding="utf-8")


def story_memory_group_key(record: dict[str, Any]) -> tuple[int | None, str]:
    timeline_raw = record.get("story_timeline")
    timeline: int | None
    try:
        timeline = int(timeline_raw) if timeline_raw not in (None, "") else None
    except (TypeError, ValueError):
        timeline = None
    chapter_title = str(record.get("chapter_title") or "").strip()
    return timeline, chapter_title


def story_memory_group_dir_name(record: dict[str, Any], fallback_index: int) -> str:
    timeline, chapter_title = story_memory_group_key(record)
    label_source = chapter_title or f"chapter-{fallback_index:03d}"
    label = compact_label(label_source, max_length=36)
    if timeline is not None:
        return f"ch-{timeline:03d}-{label}"
    return f"chx-{fallback_index:03d}-{label}"


def story_memory_record_filename(record: dict[str, Any], index: int) -> str:
    parts = [
        record.get("title"),
        record.get("memory_type"),
    ]
    label = compact_label("-".join(str(part) for part in parts if part), max_length=32)
    return f"memory-{index:03d}-{label}.md"


def group_story_memories(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[int | None, str], dict[str, Any]] = {}
    fallback_index = 0
    for record in records:
        key = story_memory_group_key(record)
        if key not in groups:
            fallback_index += 1
            timeline, chapter_title = key
            groups[key] = {
                "timeline": timeline,
                "chapter_title": chapter_title,
                "dir_name": story_memory_group_dir_name(record, fallback_index),
                "records": [],
            }
        groups[key]["records"].append(record)
    return list(groups.values())


def write_story_memory_root_index(target_dir: Path, groups: list[dict[str, Any]]) -> None:
    lines = ["# story_memories", ""]
    for group in groups:
        details: list[str] = []
        if group.get("chapter_title"):
            details.append(f"chapter={group['chapter_title']}")
        if group.get("timeline") is not None:
            details.append(f"story_timeline={group['timeline']}")
        details.append(f"memories={len(group['records'])}")
        lines.append(f"- `{group['dir_name']}/`: " + " | ".join(details))
    lines.append("")
    (target_dir / "_index.md").write_text("\n".join(lines), encoding="utf-8")


def write_story_memory_section(target_dir: Path, records: list[dict[str, Any]]) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    groups = group_story_memories(records)
    for group in groups:
        chapter_dir = target_dir / group["dir_name"]
        chapter_dir.mkdir(parents=True, exist_ok=True)
        file_names: list[str] = []
        for index, record in enumerate(group["records"], start=1):
            file_name = story_memory_record_filename(record, index)
            file_names.append(file_name)
            (chapter_dir / file_name).write_text(
                build_record_markdown("story_memories", record, index),
                encoding="utf-8",
            )
        write_section_index("story_memories", chapter_dir, group["records"], file_names)
    write_story_memory_root_index(target_dir, groups)


def story_memory_record_files(path: Path) -> list[Path]:
    files = sorted(
        file_path
        for file_path in path.glob("*.md")
        if not file_path.name.startswith("_")
    )
    nested_dirs = sorted(
        child
        for child in path.iterdir()
        if child.is_dir() and not child.name.startswith((".", "_"))
    )
    for nested_dir in nested_dirs:
        files.extend(
            sorted(
                file_path
                for file_path in nested_dir.glob("*.md")
                if not file_path.name.startswith("_")
            )
        )
    return files


def grouped_section_key(section: str, record: dict[str, Any]) -> tuple[str, str]:
    if section == "character_careers":
        return str(record.get("career_name") or "").strip(), str(record.get("career_type") or "").strip()
    if section == "organization_members":
        return str(record.get("organization_name") or "").strip(), ""
    if section == "relationships":
        return str(record.get("source_name") or "").strip(), ""
    return "", ""


def grouped_section_dir_name(section: str, record: dict[str, Any], fallback_index: int) -> str:
    primary, secondary = grouped_section_key(section, record)
    if section == "character_careers":
        label_source = primary or f"career-{fallback_index:03d}"
        label = compact_label(label_source, max_length=36)
        type_label = compact_label(secondary or "unknown", max_length=16)
        return f"career-{fallback_index:03d}-{type_label}-{label}"
    if section == "organization_members":
        label_source = primary or f"organization-{fallback_index:03d}"
        label = compact_label(label_source, max_length=36)
        return f"org-{fallback_index:03d}-{label}"
    if section == "relationships":
        label_source = primary or f"source-{fallback_index:03d}"
        label = compact_label(label_source, max_length=36)
        return f"char-{fallback_index:03d}-{label}"
    return f"group-{fallback_index:03d}"


def grouped_record_filename(section: str, record: dict[str, Any], index: int) -> str:
    if section == "character_careers":
        parts = [record.get("career_name"), record.get("character_name"), record.get("career_type")]
        label = compact_label("-".join(str(part) for part in parts if part), max_length=32)
        return f"charcareer-{index:03d}-{label}.md"
    if section == "organization_members":
        parts = [record.get("organization_name"), record.get("character_name"), record.get("position")]
        label = compact_label("-".join(str(part) for part in parts if part), max_length=32)
        return f"member-{index:03d}-{label}.md"
    if section == "relationships":
        parts = [record.get("source_name"), record.get("target_name"), record.get("relationship_name")]
        label = compact_label("-".join(str(part) for part in parts if part), max_length=32)
        return f"rel-{index:03d}-{label}.md"
    return record_filename(section, record, index)


def group_section_records(section: str, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    fallback_index = 0
    for record in records:
        key = grouped_section_key(section, record)
        if key not in groups:
            fallback_index += 1
            groups[key] = {
                "primary": key[0],
                "secondary": key[1],
                "dir_name": grouped_section_dir_name(section, record, fallback_index),
                "records": [],
            }
        groups[key]["records"].append(record)
    return list(groups.values())


def write_grouped_section_root_index(section: str, target_dir: Path, groups: list[dict[str, Any]]) -> None:
    lines = [f"# {section}", ""]
    for group in groups:
        details: list[str] = []
        if section == "character_careers":
            if group.get("primary"):
                details.append(f"career={group['primary']}")
            if group.get("secondary"):
                details.append(f"type={group['secondary']}")
        elif section == "organization_members":
            if group.get("primary"):
                details.append(f"organization={group['primary']}")
        elif section == "relationships":
            if group.get("primary"):
                details.append(f"source={group['primary']}")
        details.append(f"records={len(group['records'])}")
        lines.append(f"- `{group['dir_name']}/`: " + " | ".join(details))
    lines.append("")
    (target_dir / "_index.md").write_text("\n".join(lines), encoding="utf-8")


def write_grouped_section(section: str, target_dir: Path, records: list[dict[str, Any]]) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    groups = group_section_records(section, records)
    for group in groups:
        group_dir = target_dir / group["dir_name"]
        group_dir.mkdir(parents=True, exist_ok=True)
        file_names: list[str] = []
        for index, record in enumerate(group["records"], start=1):
            file_name = grouped_record_filename(section, record, index)
            file_names.append(file_name)
            (group_dir / file_name).write_text(
                build_record_markdown(section, record, index),
                encoding="utf-8",
            )
        write_section_index(section, group_dir, group["records"], file_names)
    write_grouped_section_root_index(section, target_dir, groups)


def grouped_section_record_files(path: Path) -> list[Path]:
    files = sorted(
        file_path
        for file_path in path.glob("*.md")
        if not file_path.name.startswith("_")
    )
    nested_dirs = sorted(
        child
        for child in path.iterdir()
        if child.is_dir() and not child.name.startswith((".", "_"))
    )
    for nested_dir in nested_dirs:
        files.extend(
            sorted(
                file_path
                for file_path in nested_dir.glob("*.md")
                if not file_path.name.startswith("_")
            )
        )
    return files


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
        - `relationships/`：角色关系（按起始角色分目录）
        - `organizations/`：组织详情
        - `organization-members/`：组织成员（按组织分目录）
        - `careers/`：职业体系
        - `character-careers/`：角色职业关联（按职业分目录）
        - `foreshadows/`：伏笔
        - `generation-history/`：生成历史
        - `story-memories/`：故事记忆（按章节分目录）
        - `plot-analysis/`：剧情分析
        - `writing-styles/`：写作风格

        每个目录下都会生成一个 `_index.md`，用于把短文件名映射到真实标题和关键字段。
        `story-memories/`、`character-careers/`、`organization-members/`、`relationships/` 的根 `_index.md` 只列第一层分组目录，分组目录内再列具体记录文件。

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
        python tools/mumu_workspace.py export-project <project_id> workspace/book.json
        python tools/mumu_workspace.py json-to-md workspace/book.json workspace/book-workspace
        python tools/mumu_workspace.py validate workspace/book-workspace
        python tools/mumu_workspace.py sync-project <project_id> workspace/book-workspace
        ```
        """
    )


def build_workspace_claude_text(container_dir: Path, data_dir: Path, data: dict[str, Any]) -> str:
    project_title = str(data.get("project", {}).get("title") or data_dir.name or "项目")
    data_dir_name = data_dir.name
    container_name = container_dir.name
    source_project_id = str(data.get("source_project_id") or "未记录")
    template_path = REPO_ROOT / "tools" / "CLAUDE.md"
    if template_path.exists():
        template = template_path.read_text(encoding="utf-8")
    else:
        template = "# CLAUDE.md\n请阅读同目录下的 `tool_README.md`。\n"
    return (
        template
        .replace("{{CONTAINER_NAME}}", container_name)
        .replace("{{DATA_DIR_NAME}}", data_dir_name)
        .replace("{{PROJECT_TITLE}}", project_title)
        .replace("{{SOURCE_PROJECT_ID}}", source_project_id)
    )


def build_workspace_tool_readme_text() -> str:
    source_path = REPO_ROOT / "tools" / "README.md"
    if source_path.exists():
        return source_path.read_text(encoding="utf-8").rstrip() + "\n"
    return "# tool_README.md\n工具说明缺失。\n"


def write_workspace_readme(output_dir: Path, data: dict[str, Any]) -> None:
    _ = data
    (output_dir / "README.md").write_text(build_generic_readme_text() + "\n", encoding="utf-8")


def write_workspace_claude_file(container_dir: Path, data_dir: Path, data: dict[str, Any]) -> None:
    container_dir.mkdir(parents=True, exist_ok=True)
    (container_dir / "CLAUDE.md").write_text(
        build_workspace_claude_text(container_dir, data_dir, data) + "\n",
        encoding="utf-8",
    )
    (container_dir / "tool_README.md").write_text(
        build_workspace_tool_readme_text(),
        encoding="utf-8",
    )


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


def write_workspace_from_data(
    data: dict[str, Any],
    output_dir: Path,
    force: bool,
    source_json: Path | None = None,
) -> Path:
    normalized_data, normalization_errors = normalize_export_dict(data)
    validation = validate_export_dict(normalized_data)
    combined_errors = list(validation.errors)
    for error in normalization_errors:
        if error not in combined_errors:
            combined_errors.append(error)
    if combined_errors:
        raise ValueError("input JSON is not a valid MuMuAINovel export")

    if output_dir.exists():
        if not force:
            raise FileExistsError(f"output directory already exists: {output_dir}")
        if not output_dir.is_dir():
            raise NotADirectoryError(f"output path is not a directory: {output_dir}")
        clear_managed_workspace_paths(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    write_workspace_meta(output_dir, source_json or Path("<generated>"), normalized_data)
    write_workspace_readme(output_dir, normalized_data)

    for section in TOP_LEVEL_ORDER:
        section_value = normalized_data[section]
        target = output_dir / SECTION_PATHS[section]

        if section in SINGLE_RECORD_SECTIONS:
            if section_value:
                markdown = build_record_markdown(section, section_value, 1)
                target.write_text(markdown, encoding="utf-8")
            continue

        if section == "story_memories":
            write_story_memory_section(target, section_value)
            continue

        if section in {"character_careers", "organization_members", "relationships"}:
            write_grouped_section(section, target, section_value)
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


def export_json_to_workspace(input_json: Path, output_dir: Path, force: bool) -> Path:
    data = json.loads(input_json.read_text(encoding="utf-8"))
    normalized_data, _ = normalize_export_dict(data)
    project_title = normalized_data.get("project", {}).get("title", "")
    data_dir = resolve_workspace_export_target(output_dir, project_title)
    written_dir = write_workspace_from_data(normalized_data, data_dir, force=force, source_json=input_json)
    write_workspace_claude_file(output_dir, written_dir, normalized_data)
    return written_dir


def read_workspace_meta(workspace_dir: Path) -> dict[str, Any]:
    data_dir = resolve_workspace_data_dir(workspace_dir)
    meta_file = data_dir / ".mumu-workspace.toml"
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
    declared_body_fields = set(frontmatter.get("body_fields", []))
    missing_body_fields = sorted(field_name for field_name in declared_body_fields if field_name not in body_data)
    if missing_body_fields:
        raise ValueError(
            f"markdown body fields are missing or malformed in {file_path}: {', '.join(missing_body_fields)}"
        )
    json_string_fields = set(frontmatter.get("json_string_fields", []))
    for field_name, value in body_data.items():
        if field_name in json_string_fields:
            record[field_name] = value
        else:
            record[field_name] = value
    return record


def workspace_to_export_dict(workspace_dir: Path, normalize: bool = True) -> dict[str, Any]:
    data_dir = resolve_workspace_data_dir(workspace_dir)
    meta = read_workspace_meta(data_dir)
    data: dict[str, Any] = {
        "version": meta.get("version", ""),
        "export_time": meta.get("export_time", ""),
    }
    if meta.get("source_project_id"):
        data["source_project_id"] = meta.get("source_project_id")

    for section in TOP_LEVEL_ORDER:
        path = data_dir / SECTION_PATHS[section]
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
        if section == "story_memories":
            files = story_memory_record_files(path)
        elif section in {"character_careers", "organization_members", "relationships"}:
            files = grouped_section_record_files(path)
        else:
            files = sorted(
                file_path
                for file_path in path.glob("*.md")
                if not file_path.name.startswith("_")
            )
        data[section] = [parse_record_markdown(file_path) for file_path in files]

    if not normalize:
        return data
    normalized, _ = normalize_export_dict(data)
    return normalized


def write_export_json(output_json: Path, data: dict[str, Any]) -> None:
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def validate_export_dict(data: dict[str, Any]) -> ValidationSummary:
    errors: list[str] = []
    warnings: list[str] = []
    errors.extend(collect_strict_schema_errors(data))
    normalized, normalization_errors = normalize_export_dict(data)
    errors.extend(normalization_errors)

    try:
        ProjectExportData.model_validate(normalized)
    except ValidationError as exc:
        for issue in exc.errors():
            location = ".".join(str(item) for item in issue.get("loc", ()))
            message = issue.get("msg", "validation error")
            errors.append(f"{location}: {message}")

    version = normalized.get("version", "")
    if not version:
        errors.append("missing version")
    elif version not in SUPPORTED_VERSIONS:
        warnings.append(
            f"version mismatch: {version} not in supported versions {sorted(SUPPORTED_VERSIONS)}"
        )

    project = normalized.get("project")
    if not project:
        errors.append("missing project")
    elif not project.get("title"):
        warnings.append("project.title is empty")

    statistics = {
        "chapters": len(normalized.get("chapters", [])),
        "characters": len(normalized.get("characters", [])),
        "outlines": len(normalized.get("outlines", [])),
        "relationships": len(normalized.get("relationships", [])),
        "organizations": len(normalized.get("organizations", [])),
        "organization_members": len(normalized.get("organization_members", [])),
        "writing_styles": len(normalized.get("writing_styles", [])),
        "generation_history": len(normalized.get("generation_history", [])),
        "careers": len(normalized.get("careers", [])),
        "character_careers": len(normalized.get("character_careers", [])),
        "story_memories": len(normalized.get("story_memories", [])),
        "plot_analysis": len(normalized.get("plot_analysis", [])),
        "foreshadows": len(normalized.get("foreshadows", [])),
        "has_default_style": 1 if normalized.get("project_default_style") else 0,
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
    import_project.add_argument("input_path", type=Path, help="JSON file or Markdown workspace directory")
    import_project.add_argument("--base-url", default=None, help="backend base URL, default reads backend/.env")
    import_project.add_argument("--username", default=None, help="local auth username, default reads backend/.env")
    import_project.add_argument("--password", default=None, help="local auth password, default reads backend/.env")

    sync_project = subparsers.add_parser("sync-project", help="strictly sync JSON or workspace into a specific existing project")
    sync_project.add_argument("target_project_id", help="target MuMuAINovel project id")
    sync_project.add_argument("input_path", type=Path, help="JSON file or Markdown workspace directory")
    sync_project.add_argument("--base-url", default=None, help="backend base URL, default reads backend/.env")
    sync_project.add_argument("--username", default=None, help="local auth username, default reads backend/.env")
    sync_project.add_argument("--password", default=None, help="local auth password, default reads backend/.env")
    sync_project.add_argument("--backup-dir", type=Path, default=REPO_ROOT / "workspace" / "backups", help="backup directory before sync")

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
        raw_data = workspace_to_export_dict(workspace_dir, normalize=False)
        summary = validate_export_dict(raw_data)
        if not summary.valid:
            print_validation(summary, str(workspace_dir))
            return 1
        data = workspace_to_export_dict(workspace_dir, normalize=True)
        write_export_json(output_json, data)
        print_validation(summary, str(workspace_dir))
        print(f"output_json: {output_json}")
        return 0

    if args.command == "validate":
        path = args.path.resolve()
        if path.is_dir():
            summary = validate_export_dict(workspace_to_export_dict(path, normalize=False))
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
        base_url, username, password = resolve_api_credentials(args)
        client = LocalAPIClient(base_url, username, password)
        client.login()
        materialized = materialize_input(args.input_path)
        try:
            local_summary = validate_export_dict(materialized.data)
            print("本地校验结果:")
            print_validation(local_summary, str(args.input_path.resolve()))
            if not local_summary.valid:
                return 1

            validation = client.upload_file_json("/api/projects/validate-import", materialized.json_path)
            print("服务端校验结果:")
            print(json.dumps(validation, ensure_ascii=False, indent=2))
            if not validation.get("valid"):
                return 1

            result = client.upload_file_json("/api/projects/import", materialized.json_path)
            print("导入结果:")
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if result.get("success") else 1
        finally:
            cleanup_materialized_input(materialized)

    if args.command == "sync-project":
        base_url, username, password = resolve_api_credentials(args)
        client = LocalAPIClient(base_url, username, password)
        client.login()
        materialized = materialize_input(args.input_path)
        try:
            local_summary = validate_export_dict(materialized.data)
            print("本地校验结果:")
            print_validation(local_summary, str(args.input_path.resolve()))
            if not local_summary.valid:
                return 1

            source_project_id = materialized.data.get("source_project_id")
            if not source_project_id:
                print("严格同步失败：输入缺少 source_project_id。")
                return 1
            if source_project_id != args.target_project_id:
                print(
                    "严格同步失败："
                    f"source_project_id={source_project_id} 与目标项目ID={args.target_project_id} 不一致。"
                )
                return 1

            validation = client.upload_file_json("/api/projects/validate-import", materialized.json_path)
            print("服务端校验结果:")
            print(json.dumps(validation, ensure_ascii=False, indent=2))
            if not validation.get("valid"):
                return 1

            args.backup_dir.mkdir(parents=True, exist_ok=True)
            backup_path = args.backup_dir / f"backup-{args.target_project_id}.json"
            backup_options = {
                "include_generation_history": True,
                "include_writing_styles": True,
                "include_careers": True,
                "include_memories": True,
                "include_plot_analysis": True,
                "include_foreshadows": True,
            }
            backup_content, _ = client.request_bytes(
                f"/api/projects/{args.target_project_id}/export-data",
                method="POST",
                payload=backup_options,
            )
            backup_path.write_bytes(backup_content)
            print(f"已创建同步前备份: {backup_path}")

            result = client.upload_file_json(
                f"/api/projects/{args.target_project_id}/sync-import",
                materialized.json_path,
                fields={"strict_source_match": "true"},
            )
            print("同步结果:")
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if result.get("success") else 1
        finally:
            cleanup_materialized_input(materialized)

    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
