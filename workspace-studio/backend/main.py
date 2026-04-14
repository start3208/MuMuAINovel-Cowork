from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

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
    write_export_json,
    write_workspace_from_data,
)


WORKSPACE_ROOT = REPO_ROOT / "workspace"
EXPORT_ROOT = WORKSPACE_ROOT / "_exports"
BACKUP_ROOT = WORKSPACE_ROOT / "backups"
FRONTEND_DIST = REPO_ROOT / "workspace-studio" / "frontend-dist"


class ExportWorkspaceRequest(BaseModel):
    project_id: str
    workspace_name: Optional[str] = None


class SyncWorkspaceRequest(BaseModel):
    target_project_id: Optional[str] = None


class SaveWorkspaceRequest(BaseModel):
    data: dict[str, Any]


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
    data = workspace_to_export_dict(data_dir)
    summary = validate_export_dict(data)
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
    write_workspace_from_data(
        data,
        workspace_data_dir(name, data.get("project", {}).get("title")),
        force=True,
        source_json=Path(f"<workspace:{name}>"),
    )
    return build_workspace_summary(name)


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
    export_json_to_workspace(export_path, workspace_dir(name), force=True)
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
        write_export_json(temp_file, data)

        validation = client.upload_file_json("/api/projects/validate-import", temp_file)
        if not validation.get("valid"):
            raise HTTPException(status_code=400, detail=validation)

        BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
        backup_path = BACKUP_ROOT / f"backup-{project_id}.json"
        backup_options = {
            "include_generation_history": True,
            "include_writing_styles": True,
            "include_careers": True,
            "include_memories": True,
            "include_plot_analysis": True,
            "include_foreshadows": True,
        }
        backup_content, _ = client.request_bytes(
            f"/api/projects/{project_id}/export-data",
            method="POST",
            payload=backup_options,
        )
        backup_path.write_bytes(backup_content)

        result = client.upload_file_json(
            f"/api/projects/{project_id}/sync-import",
            temp_file,
            fields={"strict_source_match": "true"},
        )
        return {
            "backup_path": str(backup_path),
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
    data = load_workspace_data(name)
    summary = validate_export_dict(data)
    return {
        "valid": summary.valid,
        "version": summary.version,
        "project_name": summary.project_name,
        "statistics": summary.statistics,
        "errors": summary.errors,
        "warnings": summary.warnings,
    }


@app.post("/api/workspaces/{name}/sync")
def api_workspace_sync(name: str, payload: SyncWorkspaceRequest = Body(default=SyncWorkspaceRequest())) -> dict[str, Any]:
    return sync_workspace_to_project(name, payload.target_project_id)


@app.delete("/api/workspaces/{name}")
def api_workspace_delete(name: str) -> dict[str, str]:
    target = workspace_dir(name)
    if not target.exists():
        raise HTTPException(status_code=404, detail="工作区不存在")
    for child in target.rglob("*"):
        pass
    import shutil
    shutil.rmtree(target)
    return {"message": "工作区已删除"}


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
