# ARD Nespereira · Bar Manager

Fullstack app: **FastAPI + MongoDB** backend (`backend/server.py`) and a **Create React App (craco) + Tailwind** frontend (`frontend/`).

## Running in Base44

```
docker compose -f docker-compose.base44.yml up -d
```

- **Frontend** (port 3000): CRA dev server via `yarn start` (craco). Live reload. Needs `REACT_APP_BACKEND_URL` pointing at the backend's public URL.
- **Backend** (port 8000): `uvicorn server:app --reload` from `backend/`. Live reload.
- **Mongo** (internal): seeded on startup with default users.

## Wiring notes

- Auth uses **httponly cookies** (`access_token`, `samesite=none; secure`) + `withCredentials` on the client. The two services run on **separate origins** (different host ports = different sites on the PSL), which is why the cookies are already configured cross-site. CORS on the backend is set to the frontend's preview origin.
- `BASE44_PUBLIC_HOST_SUFFIX` is substituted into `REACT_APP_BACKEND_URL` (frontend) and `CORS_ORIGINS` (backend). Never hardcode the resolved value — it changes when the environment is recreated.

## Backend runtime dependencies

`backend/requirements.txt` contains many heavy/exotic packages (pandas, numpy, litellm, openai, huggingface, boto3, google-api, jq, etc.) that `server.py` **does not import**. To keep the dev image light and reliable, the compose service installs the trimmed `backend/requirements.base44.txt` instead, which has only what `server.py` actually uses (fastapi, uvicorn, motor, pydantic, PyJWT, bcrypt, resend, etc.). If a new import is added to `server.py`, add it to `requirements.base44.txt`.

## Secrets

- `RESEND_API_KEY` (optional): for transactional email. The app boots and runs fully without it; email sends just report "not configured". Provided via the platform secrets (`/run/base44/app.env`).
- `JWT_SECRET`, `MONGO_URL`, `DB_NAME` are local-dev values generated in compose — not user secrets.

## Default logins (seeded on startup)

- Admin: `admin@ard.pt` / `admin123`
- Tesoureiro: `tesoureiro@ard.pt` / `tesoureiro123`
- Funcionário: `func1@ard.pt` / `func123` (func2, func3 same password)

## Verifying it works

- `curl -H "Host: 3000-$BASE44_PUBLIC_HOST_SUFFIX" http://localhost:3000/` → serves the CRA index (live source).
- `curl -H "Host: 8000-$BASE44_PUBLIC_HOST_SUFFIX" http://localhost:8000/docs` → FastAPI Swagger (200).
- `POST /api/auth/login` with admin credentials → 200 + `Set-Cookie: access_token=...; SameSite=none; Secure`.

## Tests

Backend tests (`backend/tests/`) use `pytest` + `requests` against a running server. They are not part of the dev compose; run them separately if needed (they require the full `requirements.txt` deps).
