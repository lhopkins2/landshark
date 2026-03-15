# Windows Setup for LandShark Group

## Prerequisites

- Node.js (LTS) installed and on PATH
- Python 3.12+ installed and on PATH
- Git installed

## Setup Instructions

Run all commands from the project root (`landshark-group/`).

### Frontend

```powershell
npm install
```

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
python manage.py migrate
python manage.py create_dev_superuser
```

The dev superuser is `admin@landshark.dev` / `devpassword123`.

### Running the App

Open two terminals:

**Terminal 1 — Frontend (from project root):**
```powershell
npm run dev
```

**Terminal 2 — Backend (from `backend/`):**
```powershell
.venv\Scripts\activate
python manage.py runserver 8001
```

Frontend runs on http://localhost:5174, backend on http://localhost:8001. The Vite dev server proxies `/api` requests to the backend automatically.
