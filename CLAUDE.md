# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Chain of title document management platform with AI-powered analysis. Full-stack: React/TypeScript frontend + Django REST backend.

## ATTENTION

YOU NEVER HAVE PERMISSION TO RUN AN ANALYSIS BY CALLING THE AI API WITHOUT THE USERS EXPLICIT PERMISSION

## Tech Stack

**Frontend:** React 19, TypeScript, Vite 7, React Router 7, Zustand (state), TanStack React Query (server state), Axios, Lucide icons, date-fns. Custom CSS with variables (no Tailwind/UI library).

**Backend:** Django 5.1, Django REST Framework, SimpleJWT (email-based auth), SQLite (dev), PyMuPDF, python-docx, fpdf2. AI: Anthropic, OpenAI, Google Generative AI.

**Linting:** ESLint + TypeScript ESLint (frontend), Ruff (backend).

## Commands

```bash
# Frontend (from project root)
npm run dev            # Vite dev server on port 5174
npm run build          # tsc -b && vite build
npm run lint           # ESLint

# Backend (from backend/)
python manage.py runserver 8001
python manage.py makemigrations
python manage.py migrate
python manage.py create_dev_superuser

# Backend linting (from backend/)
ruff check .
ruff format .

# Backend dependencies managed via pyproject.toml
# Virtual env at backend/.venv — use: pip install -e ".[dev]"
```

**No test suites exist yet** — there are no frontend tests and no backend tests.

## Dev Setup

**Dev credentials:** `python manage.py create_dev_superuser` creates `admin@landshark.dev` / `devpassword123` (with `is_verified=True`).

**Environment variables:** Frontend uses `VITE_API_URL` (defaults to `/api` if unset). No `.env` files exist — backend secret key is hardcoded in settings.py for dev.

**CORS:** Backend only allows `http://localhost:5174` — update `CORS_ALLOWED_ORIGINS` in settings.py if frontend port changes.

**Database:** SQLite at `backend/db.sqlite3`. Media uploads at `backend/media/`.

## Dev Server Config

Vite proxies `/api` to `http://localhost:8001`. Path alias `@/` maps to `src/`. Both servers configured in `.claude/launch.json` as `dev` (frontend) and `backend`.

## Project Structure

```
src/                    # React frontend
  api/                  # Axios API clients (auth, clients, documents, analysis)
  components/           # Shared components (Layout, DeleteToolbar)
  pages/                # Page components (Login, Dashboard, ChainOfTitle, Documents, Settings)
  stores/               # Zustand stores (auth, theme) — persisted to localStorage
  styles/               # globals.css, theme.css (CSS variables, light/dark)
  types/                # TypeScript interfaces (models.ts)
  utils/                # Constants
backend/
  config/               # Django settings, URLs, WSGI
  apps/
    accounts/           # Custom User (email-based, no username), JWT auth
    clients/            # Client → Project → ChainOfTitle hierarchy
    documents/          # File upload/download, metadata extraction
    analysis/           # AI COT analysis, form templates, user settings
    core/               # TimestampedModel (UUID PK, created_at, updated_at)
  prompts/              # AI prompt templates (cot_analysis.txt)
  media/                # Uploaded files
```

## Architecture Patterns

- **Routing:** `/login`, `/` (dashboard), `/chain-of-title`, `/documents`, `/settings`. ProtectedRoute checks auth store.
- **State:** Zustand stores with localStorage persistence (prefix `landshark-group-*`). React Query for server data (5min stale time).
- **API Client:** Axios with Bearer token interceptor. Auto-refreshes on 401, logs out on refresh failure.
- **Backend Models:** All inherit `TimestampedModel` (UUID pk). Hierarchy: Client → Project → ChainOfTitle → Document.
- **Auth:** Email as USERNAME_FIELD. JWT: 1hr access, 7-day refresh, rotation + blacklist enabled.
- **Styling:** CSS variables in `theme.css`. Brand colors: brown `#8B6914`, yellow `#D4A017`. Dark mode via `data-theme="dark"` on `<html>`. All custom CSS — no component libraries.
- **Backend REST:** ViewSets, DjangoFilterBackend, SearchFilter, OrderingFilter. Service modules in `apps/*/services/`. StandardPagination from `apps.core.pagination`.
- **Analysis Services:** `analysis/services/ai_providers.py` (Anthropic/OpenAI/Google API calls with per-provider classes), `document_generator.py` (PDF/DOCX output), `document_parser.py` (text extraction from uploaded PDFs).
- **Backend config:** Ruff configured in `pyproject.toml` — line-length 120, target Python 3.12, rules: E, F, I, N, W, UP.

## API Endpoints

```
POST   /api/auth/login/           POST /api/auth/token/refresh/
POST   /api/auth/logout/          GET  /api/auth/me/
CRUD   /api/clients/              CRUD /api/projects/
CRUD   /api/chains-of-title/      CRUD /api/documents/
GET    /api/documents/{id}/download/
CRUD   /api/form-templates/
GET|PUT /api/analysis/settings/   POST /api/analysis/run/
GET    /api/analyses/             GET  /api/analyses/{id}/
```

## Key Features

- **AI COT Analysis:** Supports Claude, GPT, Gemini. Per-user API key config stored in DB. Prompt at `backend/prompts/cot_analysis.txt`. Output: PDF or DOCX.
- **Document Management:** Upload with metadata (tract number, record holder). PDF text extraction via PyMuPDF.
- **Chain of Title:** Property details (address, county, state, parcel, legal description). Status workflow: pending → in_progress → complete.

## Known Issues

- API keys stored unencrypted in database (UserSettings model)
- No `.env` setup — secret key hardcoded in settings.py (dev only)
- No backend entries in .gitignore for env files
- SQLite only — needs PostgreSQL for production
