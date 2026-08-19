#!/usr/bin/env bash
# Always uses the project's .venv interpreter explicitly, so the backend
# never accidentally runs against a stray global Python (see README —
# a global pandas/duckdb-engine mismatch breaks dataset import silently).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
venv_python="$root/.venv/Scripts/python.exe"

if [ ! -f "$venv_python" ]; then
    echo "No .venv found at $venv_python. Run: python -m venv .venv && .venv/Scripts/activate && pip install -r requirements.txt" >&2
    exit 1
fi

reload_flag="--reload"
if [[ "${1:-}" == "--no-reload" ]]; then
    reload_flag=""
fi

"$venv_python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 $reload_flag
