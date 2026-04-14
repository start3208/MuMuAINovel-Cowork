from __future__ import annotations

import json
import sys
import tempfile
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlencode

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.mumu_workspace import (  # noqa: E402
    LocalAPIClient,
    compact_label,
    default_base_url,
    default_local_auth,
    export_json_to_workspace,
    is_workspace_container_directory,
    is_reserved_workspace_name,
    resolve_workspace_data_dir,
    validate_export_dict,
    workspace_project_dir_name,
    workspace_to_export_dict,
    write_workspace_claude_file,
    write_export_json,
    write_workspace_from_data,
)


WORKSPACE_ROOT = REPO_ROOT / "workspace"
EXPORT_ROOT = WORKSPACE_ROOT / "_exports"
BACKUP_ROOT = WORKSPACE_ROOT / "_backup"
FRONTEND_DIST = REPO_ROOT / "workspace-studio" / "frontend-dist"
MAX_BACKUPS_PER_PROJECT = 10
TRIMMED_BACKUPS_PER_PROJECT = 5


class ExportWorkspaceRequest(BaseModel):
    project_id: str
    workspace_name: Optional[str] = None
    confirmed: bool = False


class SyncWorkspaceRequest(BaseModel):
    target_project_id: Optional[str] = None
    confirmed: bool = False


class SaveWorkspaceRequest(BaseModel):
    data: dict[str, Any]


class MemorySearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    memory_types: list[str] = Field(default_factory=list)
    limit: int = 10
    min_importance: float = 0.0


class DeleteWorkspaceRequest(BaseModel):
    confirmed: bool = False


class CleanupBackupsRequest(BaseModel):
    confirmed: bool = False
    keep_latest: int = TRIMMED_BACKUPS_PER_PROJECT


class ImportBackupRequest(BaseModel):
    backup_id: str
    workspace_name: Optional[str] = None
    confirmed: bool = False


def make_client() -> LocalAPIClient:
    username, password = default_local_auth()
    if not username or not password:
        raise HTTPException(
            status_code=500,
            detail="backend/.env 中缺少 LOCAL_AUTH_USERNAME 或 LOCAL_AUTH_PASSWORD",
        )
    return LocalAPIClient(default_base_url(), username, password)


def ensure_workspace_name(name: str) -> str:
    cleaned = compact_label(name, max_length=60)
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的工作区名称")
    if is_reserved_workspace_name(cleaned):
        raise HTTPException(status_code=400, detail="工作区名称不能以下划线或点开头")
    return cleaned


def workspace_dir(name: str) -> Path:
    cleaned = ensure_workspace_name(name)
    return WORKSPACE_ROOT / cleaned


def workspace_data_dir(name: str, project_title: Optional[str] = None) -> Path:
    container_dir = workspace_dir(name)
    if container_dir.exists():
        return resolve_workspace_data_dir(container_dir)
    return container_dir / workspace_project_dir_name(project_title, fallback_name=name)


def workspace_exists(name: str) -> bool:
    target = workspace_dir(name)
    return is_workspace_container_directory(target)


def list_workspace_names() -> list[str]:
    if not WORKSPACE_ROOT.exists():
        return []
    names: list[str] = []
    for item in WORKSPACE_ROOT.iterdir():
        if is_workspace_container_directory(item):
            names.append(item.name)
    return sorted(names)


def build_workspace_summary(name: str) -> dict[str, Any]:
    container_dir = workspace_dir(name)
    data_dir = workspace_data_dir(name)
    raw_data = workspace_to_export_dict(data_dir, normalize=False)
    data = workspace_to_export_dict(data_dir, normalize=True)
    summary = validate_export_dict(raw_data)
    stat = data_dir.stat()
    return {
        "name": name,
        "path": str(data_dir),
        "container_path": str(container_dir),
        "project_title": summary.project_name,
        "source_project_id": data.get("source_project_id"),
        "version": summary.version,
        "valid": summary.valid,
        "warnings": summary.warnings,
        "statistics": summary.statistics,
        "updated_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


def load_workspace_data(name: str) -> dict[str, Any]:
    target = workspace_dir(name)
    if not target.exists():
        raise HTTPException(status_code=404, detail="工作区不存在")
    return workspace_to_export_dict(workspace_data_dir(name))


def save_workspace_data(name: str, data: dict[str, Any]) -> dict[str, Any]:
    target = workspace_dir(name)
    if not target.exists():
        raise HTTPException(status_code=404, detail="工作区不存在")
    summary = validate_export_dict(data)
    if not summary.valid:
        raise HTTPException(status_code=400, detail={"errors": summary.errors, "warnings": summary.warnings})
    data_dir = workspace_data_dir(name, data.get("project", {}).get("title"))
    write_workspace_from_data(
        data,
        data_dir,
        force=True,
        source_json=Path(f"<workspace:{name}>"),
    )
    write_workspace_claude_file(workspace_dir(name), data_dir, data)
    return build_workspace_summary(name)


def get_workspace_project_id(name: str) -> str:
    data = load_workspace_data(name)
    project_id = data.get("source_project_id")
    if not project_id:
        raise HTTPException(status_code=400, detail="工作区缺少 source_project_id，无法读取 MuMu 记忆")
    return str(project_id)


def export_remote_project_memories(project_id: str) -> list[dict[str, Any]]:
    client = make_client()
    client.login()
    export_options = {
        "include_generation_history": False,
        "include_writing_styles": False,
        "include_careers": False,
        "include_memories": True,
        "include_plot_analysis": False,
        "include_foreshadows": False,
    }
    content, _ = client.request_bytes(
        f"/api/projects/{project_id}/export-data",
        method="POST",
        payload=export_options,
    )
    payload = json.loads(content.decode("utf-8"))
    return payload.get("story_memories", [])


def normalize_memory_for_diff(memory: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(memory, ensure_ascii=False, sort_keys=True))


def compare_workspace_memories(name: str) -> dict[str, Any]:
    local_data = load_workspace_data(name)
    project_id = get_workspace_project_id(name)
    local_memories = local_data.get("story_memories", [])
    remote_memories = export_remote_project_memories(project_id)

    local_missing_id = [item for item in local_memories if not item.get("id")]
    remote_missing_id = [item for item in remote_memories if not item.get("id")]

    local_index = {str(item["id"]): item for item in local_memories if item.get("id")}
    remote_index = {str(item["id"]): item for item in remote_memories if item.get("id")}

    local_only = [local_index[key] for key in sorted(set(local_index) - set(remote_index))]
    remote_only = [remote_index[key] for key in sorted(set(remote_index) - set(local_index))]

    changed: list[dict[str, Any]] = []
    for key in sorted(set(local_index) & set(remote_index)):
        local_item = normalize_memory_for_diff(local_index[key])
        remote_item = normalize_memory_for_diff(remote_index[key])
        if local_item == remote_item:
            continue
        changed_fields = sorted(
            field
            for field in set(local_item.keys()) | set(remote_item.keys())
            if local_item.get(field) != remote_item.get(field)
        )
        changed.append(
            {
                "id": key,
                "title": local_item.get("title") or remote_item.get("title") or "",
                "memory_type": local_item.get("memory_type") or remote_item.get("memory_type") or "",
                "changed_fields": changed_fields,
                "local": local_item,
                "remote": remote_item,
            }
        )

    return {
        "project_id": project_id,
        "summary": {
            "local_total": len(local_memories),
            "remote_total": len(remote_memories),
            "local_missing_id": len(local_missing_id),
            "remote_missing_id": len(remote_missing_id),
            "local_only": len(local_only),
            "remote_only": len(remote_only),
            "changed": len(changed),
        },
        "local_missing_id": local_missing_id,
        "remote_missing_id": remote_missing_id,
        "local_only": local_only,
        "remote_only": remote_only,
        "changed": changed,
    }


def fetch_remote_project_memories(
    project_id: str,
    page: int,
    page_size: int,
    memory_type: Optional[str] = None,
) -> dict[str, Any]:
    client = make_client()
    client.login()

    query_pairs: list[tuple[str, Any]] = [
        ("page", max(1, page)),
        ("page_size", max(1, min(page_size, 200))),
    ]
    if memory_type:
        query_pairs.append(("memory_type", memory_type))
    query_string = urlencode(query_pairs, doseq=True)
    payload, _ = client.request_json(
        f"/api/memories/projects/{project_id}/memories?{query_string}",
        method="GET",
    )
    return payload


def search_remote_project_memories(
    project_id: str,
    query: str,
    memory_types: list[str],
    limit: int,
    min_importance: float,
) -> dict[str, Any]:
    client = make_client()
    client.login()

    query_pairs: list[tuple[str, Any]] = [
        ("query", query),
        ("limit", max(1, min(limit, 50))),
        ("min_importance", min_importance),
    ]
    for memory_type in memory_types:
        query_pairs.append(("memory_types", memory_type))

    query_string = urlencode(query_pairs, doseq=True)
    payload, _ = client.request_json(
        f"/api/memories/projects/{project_id}/search?{query_string}",
        method="POST",
    )
    return payload


def rebuild_remote_project_memory_index(project_id: str) -> dict[str, Any]:
    client = make_client()
    client.login()
    payload, _ = client.request_json(
        f"/api/memories/projects/{project_id}/reindex",
        method="POST",
    )
    return payload


def ensure_confirmation(confirmed: bool, action: str) -> None:
    if not confirmed:
        raise HTTPException(status_code=400, detail=f"{action} 需要二次确认")


def backup_scope_dir(source_type: str, project_id: str) -> Path:
    return BACKUP_ROOT / source_type / project_id


def backup_manifest_path(backup_dir: Path) -> Path:
    return backup_dir / "manifest.json"


def list_backups(source_type: Optional[str] = None, project_id: Optional[str] = None) -> list[dict[str, Any]]:
    if not BACKUP_ROOT.exists():
        return []

    items: list[dict[str, Any]] = []
    source_roots = [source_type] if source_type else ["ws", "mumu"]
    for current_source in source_roots:
        source_root = BACKUP_ROOT / current_source
        if not source_root.exists():
            continue
        for scope_dir in sorted(child for child in source_root.iterdir() if child.is_dir()):
            if project_id and scope_dir.name != project_id:
                continue
            for backup_dir in sorted(child for child in scope_dir.iterdir() if child.is_dir()):
                manifest_path = backup_manifest_path(backup_dir)
                if not manifest_path.exists():
                    continue
                try:
                    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                    items.append(manifest)
                except json.JSONDecodeError:
                    continue

    items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return items


def get_backup_manifest(backup_id: str) -> dict[str, Any]:
    for item in list_backups():
        if item.get("backup_id") == backup_id:
            return item
    raise HTTPException(status_code=404, detail="备份不存在")


def load_backup_payload(backup_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest = get_backup_manifest(backup_id)
    payload_path = Path(manifest["payload_path"])
    if not payload_path.exists():
        raise HTTPException(status_code=404, detail="备份数据文件不存在")
    return manifest, json.loads(payload_path.read_text(encoding="utf-8"))


def enforce_backup_cap(source_type: str, project_id: str, keep_latest: int = MAX_BACKUPS_PER_PROJECT) -> int:
    keep_latest = max(1, min(keep_latest, MAX_BACKUPS_PER_PROJECT))
    scope_dir = backup_scope_dir(source_type, project_id)
    if not scope_dir.exists():
        return 0

    manifests: list[tuple[str, Path]] = []
    for backup_dir in sorted(child for child in scope_dir.iterdir() if child.is_dir()):
        manifest_path = backup_manifest_path(backup_dir)
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifests.append((manifest.get("created_at", ""), backup_dir))
        except json.JSONDecodeError:
            manifests.append(("", backup_dir))

    manifests.sort(key=lambda item: item[0], reverse=True)
    removed = 0
    for _, backup_dir in manifests[keep_latest:]:
        shutil.rmtree(backup_dir, ignore_errors=True)
        removed += 1
    return removed


def create_backup_manifest(
    *,
    backup_id: str,
    source_type: str,
    project_id: str,
    project_title: str,
    reason: str,
    payload_path: Path,
    statistics: dict[str, Any],
    workspace_name: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "backup_id": backup_id,
        "source_type": source_type,
        "project_id": project_id,
        "project_title": project_title,
        "workspace_name": workspace_name,
        "reason": reason,
        "created_at": datetime.now().isoformat(),
        "payload_path": str(payload_path),
        "statistics": statistics,
    }


def create_json_backup(
    *,
    source_type: str,
    project_id: str,
    project_title: str,
    reason: str,
    data: dict[str, Any],
    workspace_name: Optional[str] = None,
) -> dict[str, Any]:
    scope_dir = backup_scope_dir(source_type, project_id)
    scope_dir.mkdir(parents=True, exist_ok=True)
    backup_id = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_dir = scope_dir / backup_id
    backup_dir.mkdir(parents=True, exist_ok=True)

    payload_path = backup_dir / "data.json"
    write_export_json(payload_path, data)
    statistics = validate_export_dict(data).statistics
    manifest = create_backup_manifest(
        backup_id=backup_id,
        source_type=source_type,
        project_id=project_id,
        project_title=project_title,
        reason=reason,
        payload_path=payload_path,
        statistics=statistics,
        workspace_name=workspace_name,
    )
    backup_manifest_path(backup_dir).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    enforce_backup_cap(source_type, project_id, keep_latest=MAX_BACKUPS_PER_PROJECT)
    return manifest


def fetch_remote_export(project_id: str) -> dict[str, Any]:
    client = make_client()
    client.login()
    export_options = {
        "include_generation_history": True,
        "include_writing_styles": True,
        "include_careers": True,
        "include_memories": True,
        "include_plot_analysis": True,
        "include_foreshadows": True,
    }
    content, _ = client.request_bytes(
        f"/api/projects/{project_id}/export-data",
        method="POST",
        payload=export_options,
    )
    return json.loads(content.decode("utf-8"))


def pull_project_to_workspace(project_id: str, workspace_name: Optional[str]) -> dict[str, Any]:
    client = make_client()
    client.login()

    payload, _ = client.request_json("/api/projects")
    items = payload.get("items", [])
    project = next((item for item in items if item.get("id") == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    name = workspace_name or f"ws-{compact_label(project.get('title') or 'project')}-{project_id[:8]}"
    name = ensure_workspace_name(name)

    if workspace_exists(name):
        current_data = load_workspace_data(name)
        create_json_backup(
            source_type="ws",
            project_id=str(current_data.get("source_project_id") or project_id),
            project_title=current_data.get("project", {}).get("title") or name,
            reason="pull-before",
            data=current_data,
            workspace_name=name,
        )

    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    export_path = EXPORT_ROOT / f"{name}.json"

    export_options = {
        "include_generation_history": True,
        "include_writing_styles": True,
        "include_careers": True,
        "include_memories": True,
        "include_plot_analysis": True,
        "include_foreshadows": True,
    }
    content, _ = client.request_bytes(
        f"/api/projects/{project_id}/export-data",
        method="POST",
        payload=export_options,
    )
    export_path.write_bytes(content)
    exported_data = json.loads(content.decode("utf-8"))
    create_json_backup(
        source_type="mumu",
        project_id=project_id,
        project_title=project.get("title") or name,
        reason="pull",
        data=exported_data,
        workspace_name=name,
    )
    export_json_to_workspace(export_path, workspace_dir(name), force=True)
    create_json_backup(
        source_type="ws",
        project_id=project_id,
        project_title=project.get("title") or name,
        reason="pull",
        data=workspace_to_export_dict(workspace_dir(name)),
        workspace_name=name,
    )
    return build_workspace_summary(name)


def sync_workspace_to_project(name: str, target_project_id: Optional[str]) -> dict[str, Any]:
    data = load_workspace_data(name)
    source_project_id = data.get("source_project_id")
    project_id = target_project_id or source_project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="工作区缺少 source_project_id，请手动提供 target_project_id")
    if source_project_id and source_project_id != project_id:
        raise HTTPException(status_code=400, detail="严格同步失败：source_project_id 与目标项目ID不一致")

    summary = validate_export_dict(data)
    if not summary.valid:
        raise HTTPException(status_code=400, detail={"errors": summary.errors, "warnings": summary.warnings})

    client = make_client()
    client.login()

    temp_dir = WORKSPACE_ROOT / ".tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_file = Path(tempfile.mkstemp(prefix="workspace-sync-", suffix=".json", dir=str(temp_dir))[1])
    try:
        create_json_backup(
            source_type="ws",
            project_id=project_id,
            project_title=data.get("project", {}).get("title") or name,
            reason="sync-before",
            data=data,
            workspace_name=name,
        )
        write_export_json(temp_file, data)

        validation = client.upload_file_json("/api/projects/validate-import", temp_file)
        if not validation.get("valid"):
            raise HTTPException(status_code=400, detail=validation)

        remote_before = fetch_remote_export(project_id)
        backup_manifest = create_json_backup(
            source_type="mumu",
            project_id=project_id,
            project_title=remote_before.get("project", {}).get("title") or name,
            reason="sync-before",
            data=remote_before,
            workspace_name=name,
        )

        result = client.upload_file_json(
            f"/api/projects/{project_id}/sync-import",
            temp_file,
            fields={"strict_source_match": "true"},
        )
        remote_after = fetch_remote_export(project_id)
        create_json_backup(
            source_type="mumu",
            project_id=project_id,
            project_title=remote_after.get("project", {}).get("title") or name,
            reason="sync-after",
            data=remote_after,
            workspace_name=name,
        )
        return {
            "backup_path": backup_manifest["payload_path"],
            "result": result,
        }
    finally:
        try:
            temp_file.unlink()
        except PermissionError:
            pass


app = FastAPI(title="Workspace Studio")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.get("/api/health")
def api_health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/mumu/projects")
def api_mumu_projects() -> Any:
    client = make_client()
    client.login()
    payload, _ = client.request_json("/api/projects")
    return payload


@app.post("/api/mumu/export-workspace")
def api_export_workspace(data: ExportWorkspaceRequest) -> dict[str, Any]:
    ensure_confirmation(data.confirmed, "拉取到工作区")
    return pull_project_to_workspace(data.project_id, data.workspace_name)


@app.get("/api/workspaces")
def api_workspaces() -> dict[str, Any]:
    items = [build_workspace_summary(name) for name in list_workspace_names()]
    return {"total": len(items), "items": items}


@app.get("/api/workspaces/{name}")
def api_workspace(name: str) -> dict[str, Any]:
    return build_workspace_summary(name)


@app.get("/api/workspaces/{name}/data")
def api_workspace_data(name: str) -> dict[str, Any]:
    return load_workspace_data(name)


@app.put("/api/workspaces/{name}/data")
def api_workspace_save(name: str, payload: SaveWorkspaceRequest) -> dict[str, Any]:
    return save_workspace_data(name, payload.data)


@app.post("/api/workspaces/{name}/validate")
def api_workspace_validate(name: str) -> dict[str, Any]:
    data = workspace_to_export_dict(workspace_data_dir(name), normalize=False)
    summary = validate_export_dict(data)
    return {
        "valid": summary.valid,
        "version": summary.version,
        "project_name": summary.project_name,
        "statistics": summary.statistics,
        "errors": summary.errors,
        "warnings": summary.warnings,
    }


@app.get("/api/workspaces/{name}/memories/remote")
def api_workspace_remote_memories(
    name: str,
    page: int = 1,
    page_size: int = 50,
    memory_type: Optional[str] = None,
) -> dict[str, Any]:
    project_id = get_workspace_project_id(name)
    return fetch_remote_project_memories(project_id, page, page_size, memory_type)


@app.post("/api/workspaces/{name}/memories/search")
def api_workspace_memory_search(name: str, payload: MemorySearchRequest) -> dict[str, Any]:
    project_id = get_workspace_project_id(name)
    return search_remote_project_memories(
        project_id=project_id,
        query=payload.query,
        memory_types=payload.memory_types,
        limit=payload.limit,
        min_importance=payload.min_importance,
    )


@app.get("/api/workspaces/{name}/memories/diff")
def api_workspace_memory_diff(name: str) -> dict[str, Any]:
    return compare_workspace_memories(name)


@app.post("/api/workspaces/{name}/memories/reindex-remote")
def api_workspace_memory_reindex_remote(name: str) -> dict[str, Any]:
    project_id = get_workspace_project_id(name)
    return rebuild_remote_project_memory_index(project_id)


@app.post("/api/workspaces/{name}/sync")
def api_workspace_sync(name: str, payload: SyncWorkspaceRequest = Body(default=SyncWorkspaceRequest())) -> dict[str, Any]:
    ensure_confirmation(payload.confirmed, "同步工作区")
    return sync_workspace_to_project(name, payload.target_project_id)


@app.post("/api/workspaces/{name}/delete")
def api_workspace_delete(name: str, payload: DeleteWorkspaceRequest) -> dict[str, str]:
    ensure_confirmation(payload.confirmed, "删除工作区")
    target = workspace_dir(name)
    if not target.exists():
        raise HTTPException(status_code=404, detail="工作区不存在")
    data = load_workspace_data(name)
    project_id = data.get("source_project_id") or name
    create_json_backup(
        source_type="ws",
        project_id=str(project_id),
        project_title=data.get("project", {}).get("title") or name,
        reason="delete",
        data=data,
        workspace_name=name,
    )
    shutil.rmtree(target)
    return {"message": "工作区已删除"}


@app.get("/api/backups")
def api_backups(source_type: Optional[str] = None, project_id: Optional[str] = None) -> dict[str, Any]:
    items = list_backups(source_type=source_type, project_id=project_id)
    return {"total": len(items), "items": items}


@app.post("/api/backups/import-to-workspace")
def api_import_backup_to_workspace(payload: ImportBackupRequest) -> dict[str, Any]:
    ensure_confirmation(payload.confirmed, "导入备份")
    manifest, data = load_backup_payload(payload.backup_id)
    project_id = str(manifest.get("project_id") or "project")
    workspace_name = payload.workspace_name or f"ws-{compact_label(manifest.get('project_title') or 'backup')}-{project_id[:8]}"
    workspace_name = ensure_workspace_name(workspace_name)

    if workspace_exists(workspace_name):
        current_data = load_workspace_data(workspace_name)
        create_json_backup(
            source_type="ws",
            project_id=str(current_data.get("source_project_id") or project_id),
            project_title=current_data.get("project", {}).get("title") or workspace_name,
            reason="import-backup-before",
            data=current_data,
            workspace_name=workspace_name,
        )
    write_workspace_from_data(
        data,
        workspace_data_dir(workspace_name, data.get("project", {}).get("title")),
        force=True,
        source_json=Path(f"<backup:{payload.backup_id}>"),
    )
    write_workspace_claude_file(
        workspace_dir(workspace_name),
        workspace_data_dir(workspace_name, data.get("project", {}).get("title")),
        data,
    )
    create_json_backup(
        source_type="ws",
        project_id=project_id,
        project_title=data.get("project", {}).get("title") or workspace_name,
        reason="import-backup-after",
        data=workspace_to_export_dict(workspace_dir(workspace_name)),
        workspace_name=workspace_name,
    )
    return build_workspace_summary(workspace_name)


@app.post("/api/backups/cleanup")
def api_cleanup_backups(payload: CleanupBackupsRequest) -> dict[str, Any]:
    ensure_confirmation(payload.confirmed, "清理备份")
    removed = 0
    keep_latest = max(1, min(payload.keep_latest, TRIMMED_BACKUPS_PER_PROJECT))
    for source_type in ("ws", "mumu"):
        source_root = BACKUP_ROOT / source_type
        if not source_root.exists():
            continue
        for scope_dir in sorted(child for child in source_root.iterdir() if child.is_dir()):
            removed += enforce_backup_cap(source_type, scope_dir.name, keep_latest=keep_latest)
    return {"success": True, "removed": removed, "keep_latest": keep_latest}


if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="studio-assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "API路径不存在"})
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")
