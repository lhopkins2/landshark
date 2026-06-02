# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Chain of title (COT) document management platform with AI-powered analysis. Multi-tenant SaaS: organizations contain operators/admins, plus a separate developer/enterprise tier. Full-stack: React/TypeScript frontend + Django REST backend with a Django-Q2 background worker for long-running AI jobs.

## ATTENTION — Actions that require explicit user permission

- **Never run an analysis.** Do not trigger `POST /api/analysis/run/` or `POST /api/analysis/{id}/reanalyze/`, and do not call `tasks.run_analysis_task` / `tasks.reanalyze_task` directly via the shell to "test" things. Analyses cost real money and re-run heavy multi-stage pipelines.
- **Never ship.** Do not run `./deploy/ship.sh` (or `ssh` to the droplet) without an explicit user request. It commits, pushes, and runs `deploy.sh` on the prod VPS.
- **Ignore `.claude/worktrees/*`.** Those are isolated agent worktrees; their modifications are not part of the main tree and should not be staged or "fixed up" from the main checkout.

## Tech Stack

**Frontend:** React 19, TypeScript, Vite 7, React Router 7, Zustand (state), TanStack React Query (server state), Axios, Lucide icons, date-fns, DOMPurify, JSZip, mammoth (DOCX preview). Custom CSS with variables — no Tailwind/UI library.

**Backend:** Django 5.1, DRF, SimpleJWT (email-based), django-q2 (background tasks), django-axes (brute-force lockout), django-encrypted-model-fields (Fernet at-rest encryption of API keys), python-decouple (`.env` config), dj-database-url, WhiteNoise, gunicorn. Storage: SQLite (dev) / Postgres (prod) and local FS (dev) / DigitalOcean Spaces via django-storages+boto3 (prod). PDF: PyMuPDF + fpdf2. DOCX: python-docx. AI: anthropic, openai, google-generativeai.

**Linting:** ESLint + TypeScript ESLint (frontend), Ruff (backend, `pyproject.toml` — line-length 120, py3.12, rules E/F/I/N/W/UP, migrations excluded).

## Commands

```bash
# One-shot dev (recommended) — frontend on :5174, Django runserver on :8001, qcluster co-spawned
./scripts/dev.sh                # inline mode, prefixed/colored output
./scripts/dev.sh --tmux         # tmux split (requires tmux)

# Manual: frontend (project root)
npm run dev                     # Vite on :5174 (proxies /api → :8001)
npm run build                   # tsc -b && vite build
npm run lint                    # eslint .

# Manual: backend (from backend/, with .venv activated)
python manage.py devserver 8001 # runserver + auto-spawned qcluster (DEBUG only)
python manage.py runserver 8001 # runserver alone; jobs will queue but not execute
python manage.py qcluster       # the Django-Q2 worker (needed in any non-devserver setup)
python manage.py migrate
python manage.py create_dev_superuser   # admin@landshark.dev / devpassword123
python manage.py create_dev_org         # dev Organization + Membership
python manage.py create_dev_user        # non-admin org user

ruff check . && ruff format .   # backend lint/format

# Deploy (commit + push + ssh-deploy to the staging VPS) — requires user permission
./deploy/ship.sh ["commit msg"]
```

**No test suites exist** — there are no frontend tests and no backend tests. Don't claim "tests pass" as verification; if you need to verify a backend change, do it via `manage.py shell` or by exercising the API. Frontend changes that affect rendered output should be verified in the browser.

Windows dev setup notes live in `WINDOWS_SETUP.md` (PowerShell variants of the above). `app.yaml` is a DigitalOcean App Platform manifest — not the current deploy target (we use the droplet under `deploy/`), but kept for reference.

## Dev Setup

- **Backend env**: `backend/.venv` (`pip install -e ".[dev]"` from `backend/`). Python 3.12+.
- **Dev superuser**: `admin@landshark.dev` / `devpassword123` (created with `is_verified=True`).
- **Frontend env**: `VITE_API_URL` (defaults to `/api`).
- **Backend config**: `python-decouple` reads `.env` (none committed). Defaults in `backend/config/settings.py` are dev-safe; `FIELD_ENCRYPTION_KEY` has a baked-in dev default — overriding it in prod is mandatory or all encrypted columns become unreadable. `deploy/.env.example` is the prod template.
- **CORS / CSRF**: defaults to `http://localhost:5174` + `127.0.0.1:5174`; override via `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS`.
- **Vite proxy**: `/api` → `http://localhost:8001`. Path alias `@/` → `src/`.
- **Storage in dev**: SQLite at `backend/db.sqlite3`, uploads under `backend/media/` (in `org-{uuid}/...` paths once a user is in an org).

## Architecture — The Big Picture

### Multi-tenancy

The data model is org-scoped via `accounts.Membership` (one per user, one org per user). Three principal roles:

- `Membership.Role.OPERATOR` / `ADMIN` — normal org users; admins manage their org's users.
- `User.is_developer` — cross-org "enterprise" tier; sees `/enterprise/*` routes for org provisioning.
- `User.is_superuser` — Django admin only.

Frontend route guards (`src/App.tsx`): `ProtectedRoute`, `AdminRoute` (`selectCanManageUsers`), `DeveloperRoute`, `EnterpriseRoute`. Backend authorization lives in `apps/accounts/permissions.py` + per-view checks; org filtering is applied via mixins in `apps/accounts/mixins.py`. **Always scope querysets by the requesting user's org** unless the view is explicitly enterprise/developer.

### COT Analysis Pipeline (the core feature)

When a user starts an analysis, `RunAnalysisView` creates a `COTAnalysis` row in `PENDING` and enqueues `tasks.run_analysis_task` on Django-Q2. The worker (qcluster) executes `services/pipeline.run_pipeline`, which is **two stages**:

- **Stage 1 — `services/document_analyzer.analyze_document`**: renders each PDF page to an image, calls the AI provider per page to extract structured instrument JSON (grantor/grantee/dates/legal/comments/page-range). Records per-page status, accumulates `failed_pages_count`, emits `ParsedDocumentDict`.
- **Stage 2a — `services/chain_analyzer.build_chain`**: deterministic, no-AI walk over all extracted instruments → list of `ChainEvent`s + `open_questions` (gaps, ambiguous transfers).
- **Stage 2b**: if `is_chain_clean(chain)`, skip the AI call and use `build_template_narrative` (saves a round-trip). Otherwise call `resolve_chain` → AI returns `resolved_questions` + narrative.
- **Render**: `pipeline.build_markdown_output` assembles header (BEGIN/END SEARCH DATE, DESCRIPTION), instrument table, narrative, notes. `document_generator.generate_document` produces PDF (fpdf2) or DOCX (python-docx). `services/instrument_format.py` holds the shared formatting helpers used by both the table and the narrative.
- **Persist**: `tasks._save_pipeline_result_to_analysis` writes `parsed_documents`, `chain_events`, `narrative`, `notes`, `result_text`, `prompt_text` (debug log), token usage. Then `_persist_pipeline_result` creates a child `Document` (named `"<orig> - Analyzed[.vN].ext"`, unique within the chain) and links it to the analysis as `generated_document`.

Status machine (`COTAnalysis.Status`): `PENDING → PROCESSING → COMPLETED | FAILED | CANCELLED`. Mid-pipeline cancellation is cooperative: `tasks._check_cancelled` re-reads status from the DB at safe checkpoints and raises a sentinel. Django-Q2 has `max_attempts=2` — `run_analysis_task` early-exits if the row is already terminal so retries don't double-execute.

**Reanalyze** (`tasks.reanalyze_task` → `services/reanalyze.run_reanalyze`): loads the parent analysis's structured Stage 1 output, applies user-supplied `instrument_edits`, optionally re-scans specific `pages_to_rescan` against the AI, re-runs Stage 2 with `user_instructions`. Shares the same persistence + document-generation tail (`_save_pipeline_result_to_analysis` + `_persist_pipeline_result`). The reanalyze path **does not redo all of Stage 1** — that's the whole point. Don't add a code path that does.

**Strip Doc Pg** (`StripDocPgView` → `services/document_generator.strip_page_column`): GET endpoint that re-renders an already-completed analysis's `result_text` with the "Doc Pg" column removed from the instrument table, streamed back as PDF/DOCX. Not persisted, not a re-run — pure post-processing of stored markdown. Implemented as GET so the UI can use a plain `<a href>` download.

**Prompts** live in `backend/prompts/` as plain text:
- `stage1_extract_instruments.txt` — per-page extraction
- `stage1_reextract_pages.txt` — used during reanalyze for `pages_to_rescan`
- `stage2_resolve_chain.txt` — narrative + open-question resolution

The old single-shot `cot_analysis.txt` was deleted; do not reintroduce it.

### AI providers

`services/ai_providers.py` has per-provider classes (Anthropic / OpenAI / Gemini) with a shared interface. API keys come from `OrganizationSettings` (preferred) falling back to `UserSettings`; both store keys as `EncryptedCharField` (Fernet via `FIELD_ENCRYPTION_KEY`). `ListModelsView` enumerates models for the UI's Settings page. Whether a member can supply their own keys is gated by `Membership.has_api_key_access`.

### Backend models / hierarchy

`apps/core/models.TimestampedModel` (UUID pk, created_at/updated_at, default ordering `-created_at`) is the base for almost every model. Org-scoped data hierarchy: `Organization → Client → Project → ChainOfTitle → Document`. `Document` files use the storage path `org-{uuid}/...`. `apps/core/models.AuditLog` (non-Timestamped — has its own UUID/created_at, no `updated_at`) records uploads/updates/deletes/downloads/analysis runs — the audit log UI reads this via `apps/core/audit.py` helpers. Analysis-side models: `FormTemplate`, `UserSettings`, `OrganizationSettings`, `COTAnalysis`.

### Frontend layout

- **Pages** (`src/pages/`): `LoginPage`, `DashboardPage`, `ChainOfTitlePage`, `DocumentsPage`, `SettingsPage`, `ReviewPage` (`/review/:analysisId` — operator review/editing of pipeline output, drives the markdown table editor), `DocumentAnalysesPage` (`/documents/:id/analyses` — analysis history per doc), `AuditLogPage` (admin), `UserManagementPage` (admin), `TroubleshootingPage` (developer-only — exposes `prompt_text` / `parsed_documents` / `chain_events` debug payloads). Public: `landing/LandingPage`, `landing/PricingPage`. Enterprise: `enterprise/*` for the developer tier.
- **Shared components** (`src/components/`): `DocumentDetailDrawer`, `DocumentViewer`, `ReanalyzeModal`, `CreateUserModal`, `AnalysisUncertainty` (renders gaps/open-questions UI), `StatusBadge`, `ToastContainer`, plus `enterprise/` and `layout/` subdirs (sidebar, etc.).
- **State** (`src/stores/`): Zustand stores — `authStore`, `themeStore`, `notificationStore`, `sidebarStore`, persisted where appropriate to `localStorage` under `landshark-group-*`. `authStore` exposes selectors like `selectCanManageUsers` and `selectIsDeveloper` — use these instead of recomputing role logic.
- **Server state**: TanStack React Query, 5-minute `staleTime`.
- **API client** (`src/api/`): one module per domain (`auth`, `client`, `documents`, `analysis`, `auditLog`, `organization`, `enterprise`). All go through `src/api/client.ts` — Axios with a Bearer interceptor that auto-refreshes on 401 and logs out on refresh failure. New endpoints should call through this, not `fetch`.
- **Utilities** (`src/utils/`):
  - `markdownTable.ts` — parses/serializes the AI-generated instrument table markdown; `ReviewPage` round-trips through this for edits, and several callers convert between `ParsedInstrument[]` and rendered rows. Touch carefully; it's load-bearing.
  - `textHighlight.ts` — extracts search terms from a row and wraps matches in source PDF text with `<mark class="ls-highlight">`.
  - `pageRange.ts` — parses `"12-15, 22, 30-31"` style page-range input for reanalyze rescans.
  - `constants.ts`, `format.ts` — misc constants and display helpers.
- **Styling**: `src/styles/theme.css` (CSS variables, light/dark via `data-theme="dark"` on `<html>`), `globals.css`. Brand: brown `#8B6914`, yellow `#D4A017`. All custom CSS — do not introduce a UI library.

## API Endpoints (current)

```
Auth (apps/accounts):
  POST   /api/auth/login/               POST  /api/auth/token/refresh/
  POST   /api/auth/logout/              GET   /api/auth/me/
  GET|POST /api/auth/org/members/       GET|PUT|DELETE /api/auth/org/members/{id}/

Enterprise / developer (apps/accounts/enterprise_urls):
  /api/enterprise/...  (org provisioning — developer role only)

Clients / docs:
  CRUD   /api/clients/                  CRUD  /api/projects/
  CRUD   /api/chains-of-title/          CRUD  /api/documents/
  GET    /api/documents/{id}/download/

Analysis (apps/analysis):
  CRUD     /api/form-templates/
  GET|PUT  /api/analysis/settings/      GET|PUT /api/analysis/org-settings/
  GET      /api/analysis/models/
  POST     /api/analysis/run/           POST    /api/analysis/cancel/{id}/
  POST     /api/analysis/{id}/reanalyze/
  GET      /api/analysis/{id}/strip-doc-pg/   (streams re-rendered file, no DB write)
  GET      /api/analysis/debug/{id}/          (developer-only payload)
  GET      /api/analysis/worker-health/
  GET      /api/analyses/  GET /api/analyses/{id}/
  GET      /api/dashboard/stats/        GET /api/health/backup/

Health:
  GET    /health/   (unauthenticated liveness)
```

## Auth specifics

- `accounts.User.USERNAME_FIELD = "email"`, no `username`. `UserManager` in `apps/accounts/managers.py`.
- SimpleJWT: 1h access, 7d refresh, rotation + blacklist.
- `django-axes`: 5 failures per (ip, username) → 15-minute cooloff; cleared on success. `AxesStandaloneBackend` is first in `AUTHENTICATION_BACKENDS`.

## Background jobs (Django-Q2)

- ORM broker (no Redis). `Q_CLUSTER`: workers=`Q_WORKERS` env (default 2; **must be 1 on <4GB RAM hosts** — see `deploy/.env.example`), `timeout=600`, `retry=660`, `max_attempts=2`, `ack_failures=True`.
- `manage.py devserver` co-spawns qcluster against the dev DB (checks for `RUN_MAIN` so the reloader child doesn't double-start it). For prod, qcluster runs under `deploy/landshark-worker.service`.
- `WorkerHealthView` is the UI's signal for "is the worker alive". If a long-running analysis hangs, check it before assuming a bug in the pipeline.

## Deployment

- **Target**: DigitalOcean droplet at `45.55.48.26` (nip.io domain), nginx → gunicorn (`deploy/gunicorn.conf.py`) + qcluster as separate systemd units (`landshark-web.service`, `landshark-worker.service`). Backups run via `landshark-backup.{service,timer}` calling `deploy/backup.py`.
- **Ship**: `./deploy/ship.sh` commits, pushes, and SSHes to run `deploy/deploy.sh` on the box. Don't manually `ssh` and `pip install` — let `deploy.sh` do it (it knows to migrate, collectstatic, and restart units). Requires explicit user permission (see ATTENTION).
- Prod media goes to DO Spaces via `django-storages[s3]` when `DO_SPACES_KEY` is set; otherwise falls back to local `media/`. Backup bucket is a separate DO Spaces bucket in a different region (separate credentials).
- `app.yaml` is an unused DigitalOcean App Platform manifest kept for reference; the live deploy is the droplet, not App Platform.
