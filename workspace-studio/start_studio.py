from __future__ import annotations

import os
import sys
from pathlib import Path


WORKSPACE_STUDIO_ROOT = Path(__file__).resolve().parent
REPO_ROOT = WORKSPACE_STUDIO_ROOT.parent
BACKEND_PYTHON = REPO_ROOT / "backend" / ".venv" / "Scripts" / "python.exe"
FRONTEND_DIR = WORKSPACE_STUDIO_ROOT / "frontend"
FRONTEND_DIST = WORKSPACE_STUDIO_ROOT / "frontend-dist"


def fail(message: str) -> None:
    print(f"[ERROR] {message}", file=sys.stderr)
    raise SystemExit(1)


def run_checked(command: list[str], cwd: Path) -> None:
    import subprocess
    code = subprocess.call(command, cwd=str(cwd))
    if code != 0:
        fail(f"Command failed: {' '.join(command)}")


def ensure_frontend_built() -> None:
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        print("[INFO] Workspace Studio frontend dependencies are missing. Running npm install...")
        run_checked(["npm", "install"], FRONTEND_DIR)

    if not (FRONTEND_DIST / "index.html").exists():
        print("[INFO] Workspace Studio frontend is not built. Running npm run build...")
        run_checked(["npm", "run", "build"], FRONTEND_DIR)


def main() -> None:
    if not BACKEND_PYTHON.exists():
        fail(f"Python venv not found: {BACKEND_PYTHON}")

    ensure_frontend_built()

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"

    print("[INFO] Starting Workspace Studio on http://127.0.0.1:8011")
    os.chdir(WORKSPACE_STUDIO_ROOT)
    os.execve(
        str(BACKEND_PYTHON),
        [
            str(BACKEND_PYTHON),
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8011",
        ],
        env,
    )


if __name__ == "__main__":
    main()
