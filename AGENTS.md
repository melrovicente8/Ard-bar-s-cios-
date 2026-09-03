# AGENTS.md — ARD Nespereira · Bar Manager (Base44 dev environment)

## Como arrancar
```bash
docker compose -f docker-compose.base44.yml up -d
```
- **frontend**: Vite dev server (React 18) na porta 5173, mapeada para o host :3000. Live reload ativo. `frontend/` está bind-mounted.
- **backend**: FastAPI/uvicorn com `--reload` na porta 8000. Dependências vindas de `backend/requirements.base44.txt` (subconjunto leve de `requirements.txt` — NÃO usar o requirements.txt completo, tem pacotes pesados desnecessários ao runtime).
- **mongo**: mongo:7 com credenciais locais (ard/ardpass) definidas inline no compose.

## Arquitetura / wirings não óbvios
- **Origem única**: o Vite dev server faz proxy de `/api` → `http://backend:8000` (ver `frontend/vite.config.js`). Auth por cookies funciona same-origin — não ativar CORS nem expor URLs absolutas.
- `frontend/src/lib/api.js` lê `VITE_BACKEND_URL` (vazio em dev = caminho relativo `/api`).
- Backend faz seed automático de utilizadores no startup (`admin@ard.pt/admin123`, `tesoureiro@ard.pt/tesoureiro123`, `func1@ard.pt/func123`, …) e backfills de `tx_number`, códigos de fornecedor (F01…) e PINs automáticos de sócios.
- PIN de sócio = nº de sócio com zero-pad a 5 dígitos (ex.: 88 → 00088).
- Mongo não tem porta exposta ao host — só acessível dentro do compose network.

## Convenções do repo que partem builds
- **JSX só em ficheiros `.jsx`** (Vite): `src/index.jsx`, `src/App.jsx` e páginas. Não criar JSX em `.js`.
- `postcss.config.js`/`tailwind.config.js`/`craco.config.js` são CommonJS — o `package.json` NÃO pode ter `"type": "module"`.
- `craco.config.js` é legado do CRA e não é usado pelo Vite (mas requer `dotenv` se carregado — não importar).

## Verificar que funciona
1. `curl -sf -H "Host: external.example" http://localhost:3000/` → HTML (200).
2. `curl -s http://localhost:8000/api/club/info` → JSON com nome do clube.
3. No preview: login `admin@ard.pt` / `admin123` → Dashboard com KPIs.
4. Sócio: `/socio/login` nº `88` PIN `00088` (se os dados existirem).

## Secrets
- `RESEND_API_KEY` (opcional) via dashboard Base44 → `/run/base44/app.env`, ligado ao serviço backend como último `env_file`. Sem ela, `send_email` falha graciosamente.
