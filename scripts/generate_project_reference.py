#!/usr/bin/env python3
"""Generate docs/PROJECT_COMPLETE_CODE_REFERENCE.md from the repo tree."""

from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "PROJECT_COMPLETE_CODE_REFERENCE.md"

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".pytest_cache", "dist", "build"}
SKIP_FILES = {"package-lock.json"}
SKIP_SUFFIX = {".pyc", ".pdf"}
LINE_BY_LINE_MAX = 200  # full line table if file has <= this many lines

PURPOSE: dict[str, str] = {
    "README.md": "Project overview, quick start, nginx `/api` routing, ports, security notes, reset instructions.",
    "tasks.md": "Human-maintained checklist of build tasks and completion status across prompts.",
    "docker-compose.yml": "Production/demo Compose: postgres, api (internal), nginx web on 8080.",
    "docker-compose.dev.yml": "Dev overrides: bind API and Postgres to 127.0.0.1 only.",
    "nginx.conf": "Reverse proxy: static SPA, `/api/` to api:8000 without stripping prefix, security headers.",
    "reset_db.sh": "Drop/recreate DB, restart API to run create_all + seed.",
    ".env.example": "Template environment variables (secrets not committed).",
    "openapi.json": "Exported OpenAPI 3 schema of the live API (generated artifact; regenerate from `/openapi.json`).",
    "backend/seed.py": "Idempotent demo seed: users, plans, courts, members, 30-day history via services.",
    "backend/app/main.py": "FastAPI app factory: lifespan, CORS, rate limit, error envelope, router mount, /health.",
    "backend/app/models.py": "SQLAlchemy 2.0 declarative models for all 33 PostgreSQL tables.",
    "backend/app/schemas.py": "Pydantic v2 request/response DTOs with extra=forbid on bodies.",
    "backend/app/enums.py": "String enums mirroring SRS domain values.",
    "backend/app/security.py": "Passwords, JWT, RBAC deps, login/refresh, rate limiter.",
    "frontend/src/main.tsx": "React entry: Router, React Query, auth/toast providers, all routes.",
    "frontend/src/api/client.ts": "Fetch wrapper: in-memory access token, refresh-on-401, ApiError envelope.",
}


def should_skip(p: Path) -> bool:
    if any(part in SKIP_DIRS for part in p.parts):
        return True
    if p.name in SKIP_FILES:
        return True
    if p.suffix in SKIP_SUFFIX:
        return True
    if p.resolve() == Path(__file__).resolve():
        return True
    return False


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def py_structure(text: str) -> list[str]:
    out: list[str] = []
    try:
        tree = ast.parse(text)
    except SyntaxError as exc:
        return [f"*(Could not parse Python: {exc})*"]
    for node in tree.body:
        end = getattr(node, "end_lineno", "?")
        if isinstance(node, ast.ClassDef):
            doc = (ast.get_docstring(node) or "").split("\n")[0][:240]
            out.append(f"- `class {node.name}` — lines **{node.lineno}–{end}**" + (f": {doc}" if doc else ""))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            doc = (ast.get_docstring(node) or "").split("\n")[0][:240]
            out.append(f"- `def {node.name}` — lines **{node.lineno}–{end}**" + (f": {doc}" if doc else ""))
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id.isupper():
                    out.append(f"- constant `{t.id}` — line **{node.lineno}**")
    return out


def ts_structure(text: str) -> list[str]:
    out: list[str] = []
    patterns = [
        (r"^export default function (\w+)", "default export function"),
        (r"^export function (\w+)", "export function"),
        (r"^function (\w+)", "function"),
        (r"^export const (\w+)", "export const"),
        (r"^const (\w+)", "const"),
        (r"^export type (\w+)", "export type"),
        (r"^export interface (\w+)", "export interface"),
    ]
    for i, line in enumerate(text.splitlines(), 1):
        for pat, kind in patterns:
            m = re.match(pat, line.strip())
            if m:
                out.append(f"- {kind} `{m.group(1)}` — line **{i}**")
                break
        if len(out) >= 50:
            out.append("- *(more symbols omitted)*")
            break
    return out


def line_by_line_table(text: str) -> str | None:
    lines = text.splitlines()
    if len(lines) > LINE_BY_LINE_MAX:
        return None
    rows = ["| Ln | Code |", "|----|------|"]
    for i, line in enumerate(lines, 1):
        cell = line.replace("|", "\\|").replace("\n", " ")
        if len(cell) > 100:
            cell = cell[:97] + "..."
        rows.append(f"| {i} | `{cell}` |")
    return "\n".join(rows)


def infer_purpose(path: str) -> str:
    if path in PURPOSE:
        return PURPOSE[path]
    if path.startswith("backend/app/routers/"):
        return f"HTTP router (thin): validates input, calls `services/`, maps to Pydantic responses. File `{path}`."
    if path.startswith("backend/app/services/"):
        return f"Business logic layer: SQLAlchemy queries, transactions, domain rules. File `{path}`."
    if path.startswith("backend/tests/"):
        return f"Pytest module exercising API/services against a real Postgres in Docker."
    if path.endswith(".tsx") and "/pages/" in path:
        return f"React page component for a route in `main.tsx`."
    if path.endswith(".tsx") and "/components/" in path:
        return f"Reusable UI or layout component."
    if path.startswith("docs/") and path.endswith(".md"):
        return "Project specification or build documentation."
    if path.startswith("reports/"):
        return "Build progress, prompts, or verification reports from development."
    return "Project asset; see contents and parent folder context below."


def main() -> None:
    files = sorted(
        p for p in ROOT.rglob("*") if p.is_file() and not should_skip(p) and p != OUT
    )
    # fix skip logic for scripts folder - we want to exclude scripts output only
    files = [p for p in files if "scripts" not in p.parts or p.name != "generate_project_reference.py"]

    parts: list[str] = []
    parts.append("# CCMS — Complete Project File & Code Reference\n")
    parts.append(
        "This document describes **every file and folder** in the Champions Club Management System "
        "(CCMS) repository as of the stopped-development snapshot. It explains **why each file exists**, "
        "how it fits the architecture, and provides **line-level detail** for smaller files plus "
        "**symbol-by-symbol maps** for larger modules.\n"
    )
    parts.append("## How to read this document\n")
    parts.append(
        "- **Line-by-line tables** appear for source files with ≤ "
        f"{LINE_BY_LINE_MAX} lines (config, Docker, shell, small modules).\n"
        "- **Large files** (e.g. `schemas.py`, `models.py`, staff pages) use an **outline** "
        "(classes, functions, exports with line ranges) plus narrative; open the source file "
        "alongside the line numbers cited here.\n"
        "- **Generated artifacts** (`openapi.json`, `frontend/src/api/schema.d.ts`, `package-lock.json`) "
        "are documented by role, not reproduced line-by-line.\n"
        "- **SRS** remains authoritative for behaviour; this file describes **what the code does**.\n"
    )
    parts.append("\n## Repository statistics\n")
    parts.append(f"- **Tracked files documented:** {len(files)}\n")
    py_count = sum(1 for p in files if p.suffix == ".py")
    ts_count = sum(1 for p in files if p.suffix in {".ts", ".tsx"})
    parts.append(f"- Python files: {py_count}; TypeScript/TSX: {ts_count}\n")

    parts.append("\n## Architecture (high level)\n")
    parts.append(
        "```\n"
        "Browser → nginx (web:8080) → /api/* → FastAPI (api:8000) → PostgreSQL (db)\n"
        "                └→ static React SPA (frontend build)\n"
        "```\n"
        "Business rules live in `backend/app/services/`. Routers in `backend/app/routers/` "
        "only parse HTTP, enforce `require_roles`, and call services. Money is integer paise; "
        "timestamps UTC; calendar-day logic uses `Asia/Kolkata` via `config.CLUB_TZ`.\n"
    )

    deep = ROOT / "docs" / "_reference_deep_dive.md"
    if deep.is_file():
        parts.append("\n" + deep.read_text(encoding="utf-8") + "\n")

    # Group by top-level directory
    by_dir: dict[str, list[Path]] = {}
    for p in files:
        key = rel(p).split("/")[0] if "/" in rel(p) else rel(p)
        by_dir.setdefault(key, []).append(p)

    for top in sorted(by_dir.keys(), key=lambda x: (x not in ("backend", "frontend", "docs"), x)):
        parts.append(f"\n---\n\n# Top-level: `{top}/`\n")
        for p in sorted(by_dir[top], key=lambda x: rel(x)):
            r = rel(p)
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                parts.append(f"\n## `{r}`\n\n*(Unreadable: {exc})*\n")
                continue
            nlines = len(text.splitlines())
            parts.append(f"\n## `{r}`\n")
            parts.append(f"- **Lines:** {nlines}\n")
            parts.append(f"- **Purpose:** {infer_purpose(r)}\n")

            table = line_by_line_table(text)
            if table:
                parts.append("\n### Line-by-line\n\n")
                parts.append(table + "\n")
            else:
                parts.append("\n### Structure outline\n\n")
                if p.suffix == ".py":
                    outline = py_structure(text)
                    parts.append("\n".join(outline) if outline else "*(no top-level symbols)*")
                    parts.append("\n")
                elif p.suffix in {".ts", ".tsx", ".js", ".jsx"}:
                    outline = ts_structure(text)
                    parts.append("\n".join(outline) if outline else "*(scan exports manually)*")
                    parts.append("\n")
                elif p.suffix in {".sh", ".yml", ".yaml", ".conf", ".md", ".json", ".css", ".html"}:
                    parts.append(
                        f"File has **{nlines}** lines. First lines set context; "
                        "see repository copy for full text.\n\n"
                        "**First 15 lines:**\n\n```\n"
                        + "\n".join(text.splitlines()[:15])
                        + "\n```\n"
                    )
                else:
                    parts.append(f"Binary or special file type `{p.suffix}`.\n")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {OUT} ({len(parts)} sections, {OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
