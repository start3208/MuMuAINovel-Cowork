from __future__ import annotations

import os
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = REPO_ROOT / "backend"
PYTHON = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"
STATIC_INDEX = BACKEND_DIR / "static" / "index.html"


def fail(message: str) -> None:
    print(f"[ERROR] {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not PYTHON.exists():
        fail(f"Python venv not found: {PYTHON}")
    if not STATIC_INDEX.exists():
        fail(f"MuMuAINovel static frontend is missing: {STATIC_INDEX}")

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["DEBUG"] = "false"
    env["APP_HOST"] = "127.0.0.1"
    env["APP_PORT"] = "8000"
    env["DATABASE_URL"] = "sqlite+aiosqlite:///./data/mumuai.db"

    print("[INFO] Starting MuMuAINovel on http://127.0.0.1:8000")
    os.chdir(BACKEND_DIR)
    os.execve(
        str(PYTHON),
        [
            str(PYTHON),
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
        ],
        env,
    )


if __name__ == "__main__":
    main()
