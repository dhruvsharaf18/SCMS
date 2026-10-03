# CCMS — Champions Club Management System

Local-only club management system: public site + member portal + staff console (one responsive
React SPA) on top of a FastAPI + PostgreSQL 16 backend. Everything runs on one laptop via Docker
Compose; no cloud services, no internet needed at runtime.

The SRS (`docs/SRS.md`) is the single source of truth. If code and SRS disagree, the SRS wins.

---

## Quick start

```bash
cp .env.example .env     # then edit POSTGRES_PASSWORD and ALLOWED_ORIGINS
docker compose up --build
```

Open <http://localhost:8080>. From a phone on the same Wi-Fi, open `http://<laptop-LAN-IP>:8080`.

### Run modes (SRS §11.2)

| Mode | Command | URL |
|------|---------|-----|
| **Demo / final** | `docker compose up --build` | `http://<LAN-IP>:8080` |
| **Dev (hot reload)** | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up db api` then in `frontend/`: `npm run dev -- --host 0.0.0.0` | `http://<LAN-IP>:5173`, API docs at `http://localhost:8000/docs` |

`docker-compose.dev.yml` publishes Postgres on `127.0.0.1:5432` and the API on `127.0.0.1:8000`.
Loopback only — those ports are never exposed to the LAN.

---

## The `/api` prefix — the one decision you need to know

**The `/api` prefix is preserved end to end. nginx does not strip it.**

```
browser  GET /api/v1/plans
  nginx  location /api/  →  proxy_pass http://api:8000/api/
    api  GET /api/v1/plans          (routers are mounted with prefix="/api/v1")
```

So a FastAPI router registered as `/api/v1/plans` is reached at `/api/v1/plans` from the browser in
both demo mode (nginx) and dev mode (Vite proxy). There is no path rewriting anywhere, which means
the path you see in the browser's network tab is the path you see in `GET /openapi.json`.

One exception: `GET /health` lives at the API root, not under `/api/v1` (SRS §3.2), so nginx has a
dedicated `location = /health` for it. Everything else goes through `/api/`.

---

## Ports

| Service | Published | Why |
|---------|-----------|-----|
| `web` (nginx) | `8080:80`, `8443:443` | LAN-visible HTTP and local HTTPS ports (SRS §11.1, S-22) |
| `api` | none in demo mode | Internal compose network only; dev override binds `127.0.0.1:8000` |
| `db` | none in demo mode | Internal compose network only; dev override binds `127.0.0.1:5432` |

Allow inbound TCP 8080 and 8443 (and 5173 in dev) in the OS firewall for the **private** network profile only.

---

## Security notes for this layer

- The API connects as `ccms_app`, a **non-superuser** role created by `db/init/01-app-role.sh` on
  first volume initialisation (S-20). The `postgres` superuser is used only for maintenance.
- Uvicorn runs with `--proxy-headers --forwarded-allow-ips="*"` and nginx sets `X-Forwarded-For` and
  `X-Real-IP`, so rate limiting and login lockout key on the real client IP rather than the proxy's
  (S-23). `--forwarded-allow-ips="*"` is safe here because the API is not reachable except through
  the proxy on the internal network.
- nginx sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and a `self`-based
  `Content-Security-Policy` (S-10). **No HSTS** — the demo runs on plain http.
  The CSP allows `style-src 'unsafe-inline'` because React component libraries inject inline styles;
  no inline `<script>` is allowed.
- `.env` is git-ignored; `.env.example` is committed (S-13).

---

## Reset

```bash
./reset_db.sh            # stop api, drop/recreate ccms, restart (re-seeds). Target < 30 s
./reset_db.sh --dev      # same, but keeps the docker-compose.dev.yml port overrides
docker compose down -v   # wipe everything including the pgdata volume
```

Pass `--dev` whenever the dev override is up, otherwise the restart recreates `api` from the base
compose file alone and the `127.0.0.1:8000` mapping disappears.

On Windows, run these from **Git Bash**. The `bash` on `PATH` is usually the WSL shim, which fails
if no WSL distro is installed.

---

## Repo layout (SRS §2.2)

```
docker-compose.yml  docker-compose.dev.yml  .env.example  README.md  reset_db.sh  nginx.conf
db/init/            one-time Postgres init (app role)
backend/  app/{main.py,config.py,db.py,enums.py,routers/,services/}  seed.py  tests/  requirements.txt
frontend/ public/manifest.webmanifest  src/{api,pages/{public,portal,staff},components,hooks,lib}
docs/     SRS.md, PRD.md, BRD.md, AI_BUILD_PLAYBOOK.md, DOCUMENTATION_CONTEXT.md
reports/  build reports and prompts
```

## Demo logins

Seeded by `backend/seed.py`. All demo users share the password
in `SEED_PASSWORD`, default `Club@12345`. **Demo only; change it for any real deployment.**

- `owner@club.test` (Role: OWNER)
- `manager@club.test` (Role: MANAGER)
- `desk@club.test` (Role: FRONT_DESK)
- `bar@club.test` (Role: BAR_STAFF)
- `member1@club.test`, `member2@club.test`, `member3@club.test` (Role: MEMBER)

---

## Demo data (Part C)

To populate the extended demo dataset (~590 business records including 100 members, 102 bookings, 50 shop orders, 46 bar orders, 20 leads, 16 table reservations, 7 social sessions, 8 staff employees with shifts & payroll) for the hackathon jury:

```bash
# Run demo seed inside the API container:
docker compose exec api python -m app.seed_demo
```

The script is completely idempotent (safe to run multiple times without duplicating records).
To completely reset the database and re-seed:
```bash
./reset_db.sh
docker compose exec api python -m app.seed_demo
```
