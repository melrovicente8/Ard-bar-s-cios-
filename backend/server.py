from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import jwt
import bcrypt
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

try:
    import resend
except Exception:
    resend = None

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- App ----------
app = FastAPI(title="ARD Nespereira · Bar Manager")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
CLUB_NAME = os.environ.get("CLUB_NAME", "ARD Nespereira")
QUOTA_MONTHLY_VALUE = float(os.environ.get("QUOTA_MONTHLY_VALUE", "5.00"))
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()

if resend and RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

ROLES = {"admin", "tesoureiro", "funcionario"}
POINTS_PER_EURO = 5  # 5 pts = 1 €

# ---------- Models ----------
class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str

class LoginIn(BaseModel):
    email: str
    password: str

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class ProductIn(BaseModel):
    name: str
    price: float
    quantity: int = 0
    low_stock_threshold: int = 5
    category: Optional[str] = "Bebida"
    image_url: Optional[str] = None
    is_quota: bool = False  # Quotas/cotas — não contam para valor de stock

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    quantity: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    is_quota: Optional[bool] = None

class StockReplenishIn(BaseModel):
    product_id: str
    quantity: int
    cost_price: Optional[float] = None
    note: Optional[str] = None

class ClientIn(BaseModel):
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    member_number: Optional[str] = None
    is_member: bool = False  # sócio com cotas pagas
    morada: Optional[str] = None
    pin: Optional[str] = None  # set by admin/tesoureiro to enable sócio portal login

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    member_number: Optional[str] = None
    is_member: Optional[bool] = None
    morada: Optional[str] = None
    pin: Optional[str] = None

class SaleItemIn(BaseModel):
    product_id: str
    quantity: int

class SaleIn(BaseModel):
    client_id: str
    items: List[SaleItemIn]

class SaleEditIn(BaseModel):
    client_id: Optional[str] = None  # se fornecido, transfere a venda para este cliente
    items: Optional[List[SaleItemIn]] = None  # se fornecido, substitui todos os itens

class PaymentIn(BaseModel):
    client_id: str
    amount: float
    points_used: int = 0
    note: Optional[str] = None
    keep_change_as_credit: bool = False  # se False, valor abate é capped na dívida

class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    note: Optional[str] = None

class NotifyPaymentIn(BaseModel):
    payment_id: str
    channel: str  # "email" | "whatsapp" | "sms"

class SocioLoginIn(BaseModel):
    member_number: str
    pin: str

class SocioUpdateIn(BaseModel):
    contact: Optional[str] = None
    email: Optional[str] = None
    morada: Optional[str] = None

class MBWayRequestIn(BaseModel):
    amount: float
    mbway_phone: str  # phone used to pay
    note: Optional[str] = None

class SocioPayPointsIn(BaseModel):
    points: int

class SupplierIn(BaseModel):
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    nif: Optional[str] = None
    note: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    nif: Optional[str] = None
    note: Optional[str] = None

class SupplierOrderItemIn(BaseModel):
    product_id: str
    quantity: int
    unit_cost: float

class SupplierOrderIn(BaseModel):
    supplier_id: str
    items: List[SupplierOrderItemIn]
    paid: bool = False  # se já está pago, não vai para "em dívida"
    invoice_ref: Optional[str] = None
    note: Optional[str] = None
    attachment_name: Optional[str] = None  # ex: "fatura-jan.pdf"
    attachment_data: Optional[str] = None  # data URL base64 (image/* | application/pdf), max ~2MB

class SupplierOrderPay(BaseModel):
    amount: float
    note: Optional[str] = None

class SupplierExpenseIn(BaseModel):
    supplier_id: Optional[str] = None
    description: str  # ex: "Renda", "Eletricidade", "Internet"
    amount: float
    due_date: Optional[str] = None  # ISO date string
    paid: bool = False
    paid_at: Optional[str] = None
    recurring: Optional[str] = None  # "monthly" | "yearly" | None
    note: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_data: Optional[str] = None

class SupplierExpenseUpdate(BaseModel):
    supplier_id: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[str] = None
    paid: Optional[bool] = None
    paid_at: Optional[str] = None
    recurring: Optional[str] = None
    note: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_data: Optional[str] = None

# ---------- Auth helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(uid: str, email: str) -> str:
    payload = {
        "sub": uid,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utilizador não encontrado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )

def require_role(*allowed_roles):
    """Dependency factory: ensure current user has one of allowed_roles."""
    async def _checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Sem permissão para esta ação")
        return user
    return _checker

async def send_email(to: str, subject: str, html: str) -> bool:
    """Send email via Resend. Returns False (gracefully) if not configured."""
    if not resend or not RESEND_API_KEY:
        logger_local = logging.getLogger(__name__)
        logger_local.info("Email skipped (Resend não configurado) → %s | %s", to, subject)
        return False
    try:
        params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
        result = await asyncio.to_thread(resend.Emails.send, params)
        return bool(result.get("id"))
    except Exception as e:
        logging.getLogger(__name__).warning("Resend send failed: %s", e)
        return False

# ---------- Auth routes ----------
@api_router.post("/auth/register", response_model=UserOut)
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já registado")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": email,
        "name": body.name,
        "role": "user",
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    return UserOut(id=uid, email=email, name=body.name, role="user")

@api_router.post("/auth/login", response_model=UserOut)
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    token = create_access_token(user["id"], user["email"])
    set_auth_cookie(response, token)
    return UserOut(id=user["id"], email=user["email"], name=user["name"], role=user.get("role", "user"))

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(id=user["id"], email=user["email"], name=user["name"], role=user.get("role", "user"))

def auto_pin_from_member_number(member_number: Optional[str]) -> Optional[str]:
    """PIN automático = nº de sócio com zeros à esquerda até 5 dígitos."""
    if not member_number:
        return None
    digits = "".join(ch for ch in str(member_number) if ch.isdigit())
    if not digits:
        return None
    return digits.zfill(5)

class UserRenameIn(BaseModel):
    name: str

class UserCreateIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str  # admin | tesoureiro | funcionario

@api_router.post("/users")
async def create_user(body: UserCreateIn, user: dict = Depends(require_role("admin"))):
    if body.role not in ("admin", "tesoureiro", "funcionario"):
        raise HTTPException(status_code=400, detail="Papel inválido")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=400, detail="Email já existe")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name.strip()[:80],
        "role": body.role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await _audit("user_create", user["email"], entity="user", entity_id=uid, summary=f"Criou {body.role} {doc['email']}")
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_role("admin"))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    if target.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Administradores não podem ser eliminados")
    if target.get("email") == user.get("email"):
        raise HTTPException(status_code=403, detail="Não te podes eliminar a ti próprio")
    await db.users.delete_one({"id": user_id})
    await _audit("user_delete", user["email"], entity="user", entity_id=user_id, summary=f"Eliminou {target.get('email')}")
    return {"ok": True}

@api_router.put("/users/{user_id}")
async def rename_user(user_id: str, body: UserRenameIn, user: dict = Depends(require_role("admin"))):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Nome inválido")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    if target.get("role") not in ("funcionario", "tesoureiro"):
        raise HTTPException(status_code=403, detail="Só funcionários e tesoureiros podem ser renomeados")
    await db.users.update_one({"id": user_id}, {"$set": {"name": body.name.strip()}})
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return doc

@api_router.get("/users")
async def list_users(user: dict = Depends(require_role("admin"))):
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(200)
    return items

# ---------- Products ----------
@api_router.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    items = await db.products.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return items

@api_router.post("/products")
async def create_product(body: ProductIn, user: dict = Depends(require_role("admin", "tesoureiro"))):
    pid = str(uuid.uuid4())
    doc = {
        "id": pid,
        "name": body.name,
        "price": float(body.price),
        "quantity": int(body.quantity),
        "low_stock_threshold": int(body.low_stock_threshold),
        "category": body.category or "Bebida",
        "image_url": body.image_url,
        "is_quota": bool(body.is_quota),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, body: ProductUpdate, user: dict = Depends(require_role("admin", "tesoureiro"))):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = await db.products.update_one({"id": product_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    return doc

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.products.delete_one({"id": product_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return {"ok": True}

@api_router.post("/products/replenish")
async def replenish_stock(body: StockReplenishIn, user: dict = Depends(require_role("admin", "tesoureiro"))):
    prod = await db.products.find_one({"id": body.product_id})
    if not prod:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantidade deve ser positiva")
    await db.products.update_one({"id": body.product_id}, {"$inc": {"quantity": body.quantity}})
    rec = {
        "id": str(uuid.uuid4()),
        "product_id": body.product_id,
        "product_name": prod["name"],
        "quantity": int(body.quantity),
        "cost_price": float(body.cost_price) if body.cost_price is not None else None,
        "note": body.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    await db.stock_replenishments.insert_one(rec)
    rec.pop("_id", None)
    updated = await db.products.find_one({"id": body.product_id}, {"_id": 0})
    return {"product": updated, "replenishment": rec}

@api_router.get("/products/replenishments")
async def list_replenishments(user: dict = Depends(get_current_user)):
    items = await db.stock_replenishments.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

# ---------- Clients ----------
@api_router.get("/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    items = await db.clients.find({}, {"_id": 0, "pin_hash": 0}).sort("name", 1).to_list(2000)
    return items

@api_router.post("/clients")
async def create_client(body: ClientIn, user: dict = Depends(get_current_user)):
    cid = str(uuid.uuid4())
    role = user.get("role")
    # Funcionário não pode definir is_member, member_number ou pin
    is_member = bool(body.is_member) if role in ("admin", "tesoureiro") else False
    member_number = body.member_number if role in ("admin", "tesoureiro") else None
    # PIN: explícito (admin/tesoureiro) ou auto a partir do nº sócio
    pin_hash = None
    if role in ("admin", "tesoureiro"):
        if body.pin:
            pin_hash = hash_password(body.pin)
        elif member_number:
            auto = auto_pin_from_member_number(member_number)
            if auto:
                pin_hash = hash_password(auto)
    doc = {
        "id": cid,
        "name": body.name,
        "contact": body.contact,
        "email": body.email,
        "note": body.note,
        "member_number": member_number,
        "is_member": is_member,
        "morada": body.morada,
        "pin_hash": pin_hash,
        "points": 0,
        "balance": 0.0,
        "total_spent": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.clients.insert_one(doc)
    audit_after = dict(doc)
    audit_after.pop("_id", None)
    audit_after.pop("pin_hash", None)
    await _audit("client_create", user["email"], entity="client", entity_id=doc["id"], after=audit_after, summary=f"Cliente criado: {doc['name']}" + (f" (sócio nº {doc.get('member_number')})" if doc.get('member_number') else ""))
    doc.pop("_id", None)
    doc.pop("pin_hash", None)
    return doc

@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, body: ClientUpdate, user: dict = Depends(get_current_user)):
    raw = {k: v for k, v in body.model_dump().items() if v is not None}
    if not raw:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    # Funcionários: contact, email, morada sempre; name só se NÃO for sócio
    if user.get("role") == "funcionario":
        allowed = {"contact", "email", "morada"}
        if "name" in raw:
            # buscar cliente para verificar is_member
            target = await db.clients.find_one({"id": client_id})
            if not target:
                raise HTTPException(status_code=404, detail="Cliente não encontrado")
            if target.get("is_member"):
                raise HTTPException(status_code=403, detail="Não podes editar o nome de um sócio")
            allowed = allowed | {"name"}
        if any(k not in allowed for k in raw.keys()):
            raise HTTPException(status_code=403, detail="Funcionários só podem editar nome (se não-sócio), contacto, email e morada")
    # PIN, is_member e member_number só podem ser definidos por admin/tesoureiro
    update = dict(raw)
    sensitive = {"pin", "is_member", "member_number"}
    if any(k in update for k in sensitive) and user.get("role") not in ("admin", "tesoureiro"):
        raise HTTPException(status_code=403, detail="Sem permissão para alterar estes campos")
    if "pin" in update:
        pin_value = update.pop("pin")
        if pin_value:
            update["pin_hash"] = hash_password(str(pin_value))
        else:
            update["pin_hash"] = None
    # Se nº sócio é definido/alterado e não há PIN explícito, gerar automaticamente
    if "member_number" in update and "pin_hash" not in update:
        target_mn = update.get("member_number")
        if target_mn:
            target_client = await db.clients.find_one({"id": client_id}, {"_id": 0})
            if not (target_client and target_client.get("pin_hash")):
                auto = auto_pin_from_member_number(target_mn)
                if auto:
                    update["pin_hash"] = hash_password(auto)
    # Audit: ler o estado antes
    before_doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not before_doc:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    res = await db.clients.update_one({"id": client_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    # Calcular diff
    changes = {}
    for k, new_v in update.items():
        if k == "pin_hash":
            changes["pin"] = {"before": "***", "after": "(alterado)" if new_v else "(removido)"}
            continue
        old_v = before_doc.get(k)
        if old_v != new_v:
            changes[k] = {"before": old_v, "after": new_v}
    if changes:
        await _audit("client_edit", user["email"], entity="client", entity_id=client_id, changes=changes, summary=f"Cliente editado: {doc.get('name')}")
    return doc

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(require_role("admin"))):
    before = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not before:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    res = await db.clients.delete_one({"id": client_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    await _audit("client_delete", user["email"], entity="client", entity_id=client_id, before=before, summary=f"Cliente eliminado: {before.get('name')}")
    return {"ok": True}

@api_router.get("/clients/{client_id}")
async def client_detail(client_id: str, user: dict = Depends(get_current_user)):
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    sales = await db.sales.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    payments = await db.payments.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Consumption breakdown
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=7)).isoformat()
    by_day = sum(s.get("total", 0) for s in sales if s.get("created_at", "") >= day_start)
    by_week = sum(s.get("total", 0) for s in sales if s.get("created_at", "") >= week_start)
    by_month = sum(s.get("total", 0) for s in sales if s.get("created_at", "") >= month_start)
    by_year = sum(s.get("total", 0) for s in sales if s.get("created_at", "") >= year_start)
    return {
        "client": c,
        "sales": sales,
        "payments": payments,
        "consumption": {"day": by_day, "week": by_week, "month": by_month, "year": by_year},
    }

@api_router.get("/clients-with-debt")
async def list_debtors(user: dict = Depends(get_current_user)):
    clients = await db.clients.find({}, {"_id": 0, "pin_hash": 0}).to_list(5000)
    debtors = [c for c in clients if (c.get("balance", 0) > 0)]
    debtors.sort(key=lambda x: x.get("balance", 0), reverse=True)
    return debtors

async def _audit(action_type: str, by: str, *, entity: Optional[str] = None, entity_id: Optional[str] = None, before: Optional[dict] = None, after: Optional[dict] = None, summary: Optional[str] = None, changes: Optional[dict] = None):
    """Regista uma entrada genérica no audit log."""
    rec = {
        "id": str(uuid.uuid4()),
        "type": action_type,
        "entity": entity,
        "entity_id": entity_id,
        "before": before,
        "after": after,
        "summary": summary,
        "changes": changes or {},
        "by": by,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_log.insert_one(rec)


async def _next_tx_number() -> int:
    """Counter atómico de nº de transação."""
    from pymongo import ReturnDocument
    res = await db.counters.find_one_and_update(
        {"_id": "tx"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(res["seq"]) if res else 1


async def _log_points(client_id: str, delta: int, source: str, ref_id: Optional[str], note: str, user_email: str):
    """Regista uma entrada no histórico de pontos."""
    if delta == 0:
        return
    await db.points_history.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "delta": int(delta),  # positivo = atribuído, negativo = descontado
        "source": source,  # "sale" | "sale_cancel" | "sale_edit" | "payment" | "socio_pay"
        "ref_id": ref_id,
        "note": note,
        "user_email": user_email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def _compute_points_with_rollover(client: dict, total: float) -> tuple[int, float]:
    """Retorna (points_earned, new_pending_value).
    Sócios acumulam o resto (cêntimos não convertidos) para a próxima compra.
    Não-sócios não fazem rollover."""
    is_member = bool(client.get("is_member"))
    step = 5.0 if is_member else 10.0
    pending = float(client.get("points_pending_value", 0)) if is_member else 0.0
    effective = pending + float(total)
    pts = int(effective // step)
    new_pending = round(effective - pts * step, 2) if is_member else 0.0
    return pts, new_pending


# ---------- Sales ----------
@api_router.post("/sales")
async def create_sale(body: SaleIn, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="Sem itens")
    client_doc = await db.clients.find_one({"id": body.client_id})
    if not client_doc:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    # validate stock and build line items (batch-fetch products to avoid N+1)
    product_ids = [it.product_id for it in body.items]
    products_list = await db.products.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(len(product_ids))
    products_map = {p["id"]: p for p in products_list}
    line_items = []
    total = 0.0
    for it in body.items:
        prod = products_map.get(it.product_id)
        if not prod:
            raise HTTPException(status_code=404, detail=f"Produto {it.product_id} não encontrado")
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantidade inválida")
        if prod["quantity"] < it.quantity:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {prod['name']}")
        subtotal = float(prod["price"]) * int(it.quantity)
        total += subtotal
        line_items.append({
            "product_id": prod["id"],
            "product_name": prod["name"],
            "unit_price": float(prod["price"]),
            "quantity": int(it.quantity),
            "subtotal": subtotal,
        })

    # decrement stock
    for it in body.items:
        await db.products.update_one({"id": it.product_id}, {"$inc": {"quantity": -int(it.quantity)}})

    sale_id = str(uuid.uuid4())
    # Points com rollover (sócios apenas)
    is_member = bool(client_doc.get("is_member"))
    old_pending = float(client_doc.get("points_pending_value", 0)) if is_member else 0.0
    points_earned, new_pending = _compute_points_with_rollover(client_doc, total)
    tx_no = await _next_tx_number()
    sale_doc = {
        "id": sale_id,
        "tx_number": tx_no,
        "client_id": body.client_id,
        "client_name": client_doc["name"],
        "items": line_items,
        "total": total,
        "points_earned": points_earned,
        "points_pending_before": old_pending,
        "points_pending_after": new_pending,
        "is_member_at_sale": is_member,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    await db.sales.insert_one(sale_doc)

    # update client balance, total spent, points and pending value
    set_ops: dict = {}
    inc_ops = {"balance": total, "total_spent": total, "points": points_earned}
    if is_member:
        set_ops["points_pending_value"] = new_pending
    op = {"$inc": inc_ops}
    if set_ops:
        op["$set"] = set_ops
    await db.clients.update_one({"id": body.client_id}, op)
    if points_earned:
        await _log_points(body.client_id, points_earned, "sale", sale_id, f"Venda de {total:.2f} €", user["email"])
    sale_doc.pop("_id", None)
    return sale_doc

@api_router.get("/sales")
async def list_sales(user: dict = Depends(get_current_user)):
    items = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.delete("/sales/{sale_id}")
async def cancel_sale(sale_id: str, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    # Funcionário só pode cancelar até 12h após o registo E só vendas registadas por si próprio
    if user.get("role") == "funcionario":
        if sale.get("user_email") != user["email"]:
            raise HTTPException(status_code=403, detail="Funcionários só podem cancelar vendas que registaram pessoalmente")
        try:
            created = datetime.fromisoformat(sale["created_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - created > timedelta(hours=12):
                raise HTTPException(status_code=403, detail="Funcionários só podem cancelar vendas até 12h após o registo")
        except (ValueError, KeyError):
            raise HTTPException(status_code=403, detail="Sem permissão para cancelar esta venda")
    # restock products
    for it in sale["items"]:
        await db.products.update_one({"id": it["product_id"]}, {"$inc": {"quantity": int(it["quantity"])}})
    # update client: decrement balance, total_spent and points
    total = float(sale.get("total", 0))
    pts = int(sale.get("points_earned", 0))
    inc = {"balance": -total, "total_spent": -total}
    set_ops = {}
    if pts:
        inc["points"] = -pts
    # Reverter pending value para o snapshot pré-venda (se gravado)
    if "points_pending_before" in sale:
        set_ops["points_pending_value"] = float(sale["points_pending_before"])
    op = {"$inc": inc}
    if set_ops:
        op["$set"] = set_ops
    await db.clients.update_one({"id": sale["client_id"]}, op)
    if pts:
        await _log_points(sale["client_id"], -pts, "sale_cancel", sale["id"], "Venda cancelada", user["email"])
    # audit log
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "type": "sale_cancel",
        "sale": sale,
        "by": user["email"],
        "at": datetime.now(timezone.utc).isoformat(),
    })
    await db.sales.delete_one({"id": sale_id})
    return {"ok": True, "restored_total": total, "restored_points": pts}

@api_router.put("/sales/{sale_id}")
async def update_sale(sale_id: str, body: SaleEditIn, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    # Funcionário só pode editar até 12h após o registo E só vendas registadas por si
    if user.get("role") == "funcionario":
        if sale.get("user_email") != user["email"]:
            raise HTTPException(status_code=403, detail="Funcionários só podem editar vendas que registaram pessoalmente")
        try:
            created = datetime.fromisoformat(sale["created_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - created > timedelta(hours=12):
                raise HTTPException(status_code=403, detail="Funcionários só podem editar vendas até 12h após o registo")
        except (ValueError, KeyError):
            raise HTTPException(status_code=403, detail="Sem permissão para editar esta venda")
    new_client_id = body.client_id or sale["client_id"]
    new_client = await db.clients.find_one({"id": new_client_id})
    if not new_client:
        raise HTTPException(status_code=404, detail="Cliente destino não encontrado")

    # Build new items if provided
    if body.items is not None:
        if not body.items:
            raise HTTPException(status_code=400, detail="A venda tem de ter pelo menos 1 item")
        # validate stock considering current stock + items being returned from old sale
        old_qty_by_pid = {it["product_id"]: int(it["quantity"]) for it in sale["items"]}
        # batch-fetch all products
        product_ids = [it.product_id for it in body.items]
        prods_list = await db.products.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(len(product_ids))
        prods_map = {p["id"]: p for p in prods_list}
        new_line_items = []
        new_total = 0.0
        for it in body.items:
            prod = prods_map.get(it.product_id)
            if not prod:
                raise HTTPException(status_code=404, detail=f"Produto {it.product_id} não encontrado")
            if it.quantity <= 0:
                raise HTTPException(status_code=400, detail="Quantidade inválida")
            available = int(prod["quantity"]) + old_qty_by_pid.get(it.product_id, 0)
            if available < int(it.quantity):
                raise HTTPException(status_code=400, detail=f"Stock insuficiente para {prod['name']}")
            sub = float(prod["price"]) * int(it.quantity)
            new_total += sub
            new_line_items.append({
                "product_id": prod["id"],
                "product_name": prod["name"],
                "unit_price": float(prod["price"]),
                "quantity": int(it.quantity),
                "subtotal": sub,
            })
        # Apply stock adjustments: restock old, then decrement new
        for it in sale["items"]:
            await db.products.update_one({"id": it["product_id"]}, {"$inc": {"quantity": int(it["quantity"])}})
        for it in body.items:
            await db.products.update_one({"id": it.product_id}, {"$inc": {"quantity": -int(it.quantity)}})
    else:
        new_line_items = sale["items"]
        new_total = float(sale.get("total", 0))

    old_total = float(sale.get("total", 0))
    old_points = int(sale.get("points_earned", 0))
    points_step = 5.0 if new_client.get("is_member") else 10.0
    new_points = int(new_total // points_step)

    if new_client_id != sale["client_id"]:
        # Reverter cliente antigo
        await db.clients.update_one(
            {"id": sale["client_id"]},
            {"$inc": {"balance": -old_total, "total_spent": -old_total, "points": -old_points}},
        )
        # Aplicar ao novo
        await db.clients.update_one(
            {"id": new_client_id},
            {"$inc": {"balance": new_total, "total_spent": new_total, "points": new_points}},
        )
    else:
        diff_total = new_total - old_total
        diff_points = new_points - old_points
        inc = {}
        if abs(diff_total) > 1e-9:
            inc["balance"] = diff_total
            inc["total_spent"] = diff_total
        if diff_points != 0:
            inc["points"] = diff_points
        if inc:
            await db.clients.update_one({"id": new_client_id}, {"$inc": inc})

    # audit
    changes = {}
    if new_client_id != sale["client_id"]:
        changes["client"] = {"before": sale.get("client_name"), "after": new_client["name"]}
    if body.items is not None:
        before_items = [f"{it['quantity']}× {it['product_name']}" for it in sale["items"]]
        after_items = [f"{it['quantity']}× {it['product_name']}" for it in new_line_items]
        if before_items != after_items:
            changes["items"] = {"before": before_items, "after": after_items}
    if abs(new_total - old_total) > 1e-9:
        changes["total"] = {"before": old_total, "after": new_total}
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "type": "sale_edit",
        "sale_id": sale_id,
        "client_id": new_client_id,
        "client_name": new_client["name"],
        "changes": changes,
        "before": sale,
        "by": user["email"],
        "at": datetime.now(timezone.utc).isoformat(),
    })
    await db.sales.update_one(
        {"id": sale_id},
        {"$set": {
            "client_id": new_client_id,
            "client_name": new_client["name"],
            "items": new_line_items,
            "total": new_total,
            "points_earned": new_points,
            "is_member_at_sale": bool(new_client.get("is_member", False)),
            "edited_at": datetime.now(timezone.utc).isoformat(),
            "edited_by": user["email"],
        }},
    )
    return await db.sales.find_one({"id": sale_id}, {"_id": 0})

# ---------- Sales Report (filtros) ----------
@api_router.get("/reports/sales")
async def report_sales(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_email: Optional[str] = None,
    client_id: Optional[str] = None,
    status_filter: Optional[str] = None,  # "paid" | "open" | None
    user: dict = Depends(require_role("admin", "tesoureiro")),
):
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    q: dict = {}
    if user_email:
        q["user_email"] = user_email
    if client_id:
        q["client_id"] = client_id
    if dfrom or dto:
        rng = {}
        if dfrom:
            rng["$gte"] = dfrom
        if dto:
            rng["$lte"] = dto
        q["created_at"] = rng
    sales = await db.sales.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)

    # Determinar estado pago/em aberto por cliente abatendo pagamentos cronologicamente
    clients_ids = list({s["client_id"] for s in sales})
    payments = await db.payments.find({"client_id": {"$in": clients_ids}}, {"_id": 0}).sort("created_at", 1).to_list(20000) if clients_ids else []
    paid_by_client: dict = {}
    for p in payments:
        paid_by_client[p["client_id"]] = paid_by_client.get(p["client_id"], 0.0) + float(p.get("total_credited", p.get("amount", 0)))
    # Sort sales por cliente + asc para imputar
    by_client: dict = {}
    for s in sorted(sales, key=lambda x: x["created_at"]):
        by_client.setdefault(s["client_id"], []).append(s)
    sale_status: dict = {}
    for cid, slist in by_client.items():
        remaining = paid_by_client.get(cid, 0.0)
        for s in slist:
            if remaining >= s["total"] - 1e-9:
                sale_status[s["id"]] = "paid"
                remaining -= s["total"]
            elif remaining > 1e-9:
                sale_status[s["id"]] = "partial"
                remaining = 0
            else:
                sale_status[s["id"]] = "open"

    # Anotar status; aplicar filtro de status
    for s in sales:
        s["status"] = sale_status.get(s["id"], "open")
    if status_filter:
        if status_filter == "open":
            sales = [s for s in sales if s["status"] in ("open", "partial")]
        elif status_filter == "paid":
            sales = [s for s in sales if s["status"] == "paid"]

    total = sum(s.get("total", 0) for s in sales)
    by_user: dict = {}
    for s in sales:
        ue = s.get("user_email") or "—"
        by_user[ue] = by_user.get(ue, 0) + s.get("total", 0)
    return {
        "sales": sales,
        "period": {"from": date_from, "to": date_to},
        "filters": {"user_email": user_email, "client_id": client_id, "status": status_filter},
        "totals": {"count": len(sales), "amount": total, "by_user": by_user},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "club_name": CLUB_NAME,
    }

# ---------- Audit log ----------
@api_router.get("/audit-log")
async def list_audit_log(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_email: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 500,
    user: dict = Depends(require_role("admin", "tesoureiro")),
):
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    q: dict = {}
    if user_email:
        q["by"] = user_email
    if event_type:
        q["type"] = event_type
    if dfrom or dto:
        rng = {}
        if dfrom:
            rng["$gte"] = dfrom
        if dto:
            rng["$lte"] = dto
        q["at"] = rng
    items = await db.audit_log.find(q, {"_id": 0}).sort("at", -1).to_list(min(max(limit, 1), 2000))
    return items

# ---------- Points history ----------
@api_router.get("/clients/{client_id}/points-history")
async def client_points_history(client_id: str, user: dict = Depends(get_current_user)):
    items = await db.points_history.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    earned = sum(it["delta"] for it in items if it["delta"] > 0)
    spent = sum(-it["delta"] for it in items if it["delta"] < 0)
    return {"items": items, "earned": earned, "spent": spent}

# ---------- Sócio consumption requests (Fase C) ----------
class SocioConsumptionReqIn(BaseModel):
    items: List[SaleItemIn]
    note: Optional[str] = None

# Endpoints de sócio (POST/GET /socio/consumption-request*) e validação por staff
# são definidos mais abaixo, depois de get_current_socio estar disponível.

@api_router.get("/consumption-requests")
async def list_consumption_requests(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: dict = {}
    if status_filter:
        q["status"] = status_filter
    items = await db.consumption_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.post("/consumption-requests/{req_id}/approve")
async def approve_consumption_request(req_id: str, user: dict = Depends(get_current_user)):
    req = await db.consumption_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Pedido já tratado")
    client_doc = await db.clients.find_one({"id": req["client_id"]})
    if not client_doc:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    # Validar stock + atualizar
    pids = [it["product_id"] for it in req["items"]]
    prods = await db.products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(len(pids))
    pmap = {p["id"]: p for p in prods}
    for it in req["items"]:
        prod = pmap.get(it["product_id"])
        if not prod:
            raise HTTPException(status_code=400, detail=f"Produto {it['product_name']} foi removido")
        if prod["quantity"] < it["quantity"]:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {prod['name']}")
    for it in req["items"]:
        await db.products.update_one({"id": it["product_id"]}, {"$inc": {"quantity": -int(it["quantity"])}})
    # Criar venda
    sale_id = str(uuid.uuid4())
    is_member = bool(client_doc.get("is_member"))
    old_pending = float(client_doc.get("points_pending_value", 0)) if is_member else 0.0
    points_earned, new_pending = _compute_points_with_rollover(client_doc, req["total"])
    sale_doc = {
        "id": sale_id,
        "client_id": req["client_id"],
        "client_name": req["client_name"],
        "items": req["items"],
        "total": req["total"],
        "points_earned": points_earned,
        "points_pending_before": old_pending,
        "points_pending_after": new_pending,
        "is_member_at_sale": is_member,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "source": "socio_request",
        "request_id": req_id,
    }
    await db.sales.insert_one(sale_doc)
    inc = {"balance": req["total"], "total_spent": req["total"], "points": points_earned}
    set_ops = {}
    if is_member:
        set_ops["points_pending_value"] = new_pending
    op = {"$inc": inc}
    if set_ops:
        op["$set"] = set_ops
    await db.clients.update_one({"id": req["client_id"]}, op)
    if points_earned:
        await _log_points(req["client_id"], points_earned, "sale", sale_id, f"Pedido sócio aprovado · {req['total']:.2f} €", user["email"])
    await db.consumption_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": "approved",
            "decided_at": datetime.now(timezone.utc).isoformat(),
            "decided_by": user["email"],
            "sale_id": sale_id,
        }},
    )
    sale_doc.pop("_id", None)
    return {"ok": True, "sale": sale_doc}

@api_router.post("/consumption-requests/{req_id}/reject")
async def reject_consumption_request(req_id: str, user: dict = Depends(get_current_user)):
    req = await db.consumption_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Pedido já tratado")
    await db.consumption_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": "rejected",
            "decided_at": datetime.now(timezone.utc).isoformat(),
            "decided_by": user["email"],
        }},
    )
    return {"ok": True}

# ---------- Payments ----------
@api_router.post("/payments")
async def create_payment(body: PaymentIn, user: dict = Depends(get_current_user)):
    if body.amount < 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    if body.points_used < 0:
        raise HTTPException(status_code=400, detail="Pontos inválidos")
    if body.points_used and body.points_used % POINTS_PER_EURO != 0:
        raise HTTPException(status_code=400, detail=f"Os pontos devem ser múltiplos de {POINTS_PER_EURO}")
    c = await db.clients.find_one({"id": body.client_id})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    if body.points_used and body.points_used > int(c.get("points", 0)):
        raise HTTPException(status_code=400, detail="Pontos insuficientes")
    points_euros = body.points_used / POINTS_PER_EURO
    total_paid_raw = float(body.amount) + points_euros
    if total_paid_raw <= 0:
        raise HTTPException(status_code=400, detail="O pagamento total tem de ser superior a 0")
    current_debt = max(float(c.get("balance", 0)), 0.0)
    # Cap o valor creditado se NÃO quiser deixar troco como crédito
    if not body.keep_change_as_credit and total_paid_raw > current_debt:
        total_paid = current_debt
        change_returned = round(total_paid_raw - current_debt, 2)
    else:
        total_paid = total_paid_raw
        change_returned = 0.0
    pid = str(uuid.uuid4())
    tx_no = await _next_tx_number()
    pay = {
        "id": pid,
        "tx_number": tx_no,
        "client_id": body.client_id,
        "change_returned": change_returned,  # troco devolvido em dinheiro
        "keep_change_as_credit": bool(body.keep_change_as_credit),
        "note": body.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "source": "points+cash" if (body.points_used and body.amount) else ("points" if body.points_used else "cash"),
    }
    await db.payments.insert_one(pay)
    inc = {"balance": -total_paid}
    if body.points_used:
        inc["points"] = -int(body.points_used)
    await db.clients.update_one({"id": body.client_id}, {"$inc": inc})
    if body.points_used:
        await _log_points(body.client_id, -int(body.points_used), "payment", pid, f"Pagamento (descontou {points_euros:.2f} €)", user["email"])
    pay.pop("_id", None)
    return pay

@api_router.put("/payments/{payment_id}")
async def update_payment(payment_id: str, body: PaymentUpdate, user: dict = Depends(require_role("admin", "tesoureiro"))):
    pay = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not pay:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    update = {}
    if body.note is not None:
        update["note"] = body.note
    if body.amount is not None:
        if body.amount < 0:
            raise HTTPException(status_code=400, detail="Valor inválido")
        # ajustar diferença no saldo do cliente
        old_total = float(pay.get("total_credited", pay.get("amount", 0)))
        points_value = float(pay.get("points_value", 0))
        new_total = float(body.amount) + points_value
        diff = new_total - old_total  # positivo → desconta mais à dívida
        if abs(diff) > 1e-9:
            await db.clients.update_one({"id": pay["client_id"]}, {"$inc": {"balance": -diff}})
        update["amount"] = float(body.amount)
        update["total_credited"] = new_total
        update["edited_at"] = datetime.now(timezone.utc).isoformat()
        update["edited_by"] = user["email"]
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    await db.payments.update_one({"id": payment_id}, {"$set": update})
    return await db.payments.find_one({"id": payment_id}, {"_id": 0})

@api_router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str, user: dict = Depends(require_role("admin", "tesoureiro"))):
    pay = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not pay:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    # Reverter saldo do cliente e pontos usados
    total_credited = float(pay.get("total_credited", pay.get("amount", 0)))
    points_used = int(pay.get("points_used", 0))
    inc = {"balance": total_credited}
    if points_used:
        inc["points"] = points_used
    await db.clients.update_one({"id": pay["client_id"]}, {"$inc": inc})
    await db.payments.delete_one({"id": payment_id})
    return {"ok": True, "restored_balance": total_credited, "restored_points": points_used}

# ---------- Reports ----------
def _date_in_range(iso_str: str, dfrom: Optional[str], dto: Optional[str]) -> bool:
    if not iso_str:
        return False
    if dfrom and iso_str < dfrom:
        return False
    if dto and iso_str > dto:
        return False
    return True

@api_router.get("/reports/client/{client_id}")
async def report_client(client_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    # Aceitar YYYY-MM-DD (incl. hora 00:00) ou ISO completo
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    sales = await db.sales.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    payments = await db.payments.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    sales = [s for s in sales if _date_in_range(s.get("created_at", ""), dfrom, dto)]
    payments = [p for p in payments if _date_in_range(p.get("created_at", ""), dfrom, dto)]
    total_sales = sum(s.get("total", 0) for s in sales)
    total_paid = sum(float(p.get("total_credited", p.get("amount", 0))) for p in payments)
    return {
        "client": c,
        "period": {"from": date_from, "to": date_to},
        "sales": sales,
        "payments": payments,
        "totals": {
            "sales": total_sales,
            "paid": total_paid,
            "diff": total_sales - total_paid,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "club_name": CLUB_NAME,
    }

@api_router.get("/reports/supplier/{supplier_id}")
async def report_supplier(supplier_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    s = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    orders = await db.supplier_orders.find({"supplier_id": supplier_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    expenses = await db.supplier_expenses.find({"supplier_id": supplier_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    orders = [o for o in orders if _date_in_range(o.get("created_at", ""), dfrom, dto)]
    expenses = [e for e in expenses if _date_in_range(e.get("created_at", ""), dfrom, dto)]
    total_orders = sum(o.get("total", 0) for o in orders)
    total_paid_orders = sum(o.get("amount_paid", 0) for o in orders)
    debt_orders = sum(o.get("balance_due", 0) for o in orders if not o.get("paid"))
    debt_expenses = sum(e.get("amount", 0) for e in expenses if not e.get("paid"))
    return {
        "supplier": s,
        "period": {"from": date_from, "to": date_to},
        "orders": orders,
        "expenses": expenses,
        "totals": {
            "orders": total_orders,
            "paid_orders": total_paid_orders,
            "debt_orders": debt_orders,
            "debt_expenses": debt_expenses,
            "total_debt": debt_orders + debt_expenses,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "club_name": CLUB_NAME,
    }

# ---------- Dashboard ----------
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    clients_total = await db.clients.count_documents({})
    # Cotas não contam para valor de stock nem para alertas de stock baixo
    stockable_products = [p for p in products if not p.get("is_quota")]
    total_stock_value = sum(p.get("price", 0) * p.get("quantity", 0) for p in stockable_products)
    low_stock = [p for p in stockable_products if p.get("quantity", 0) <= p.get("low_stock_threshold", 0)]

    # today sales
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today_start.isoformat()
    today_sales_cur = db.sales.find({"created_at": {"$gte": today_iso}}, {"_id": 0})
    today_sales = await today_sales_cur.to_list(2000)
    today_total = sum(s.get("total", 0) for s in today_sales)

    # week (last 7 days) and month (last 30 days) sales totals
    week_start = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    month_start = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    week_sales = await db.sales.find({"created_at": {"$gte": week_start}}, {"_id": 0}).to_list(5000)
    month_sales = await db.sales.find({"created_at": {"$gte": month_start}}, {"_id": 0}).to_list(20000)
    week_total = sum(s.get("total", 0) for s in week_sales)
    month_total = sum(s.get("total", 0) for s in month_sales)

    # outstanding debts (clients)
    clients = await db.clients.find({}, {"_id": 0, "pin_hash": 0}).to_list(2000)
    outstanding = sum(max(c.get("balance", 0), 0) for c in clients)
    today_debtors = [c for c in clients if (c.get("balance", 0) > 0)]

    # suppliers debt
    sup_orders = await db.supplier_orders.find({"paid": False}, {"_id": 0}).to_list(5000)
    sup_debt_orders = sum(o.get("balance_due", 0) for o in sup_orders)
    sup_expenses = await db.supplier_expenses.find({"paid": False}, {"_id": 0}).to_list(5000)
    sup_debt_expenses = sum(e.get("amount", 0) for e in sup_expenses)
    suppliers_debt = sup_debt_orders + sup_debt_expenses

    # last 7 days sales by day (single aggregated query)
    days_back_start = (datetime.now(timezone.utc) - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    daily_pipeline = [
        {"$match": {"created_at": {"$gte": days_back_start.isoformat()}}},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},  # YYYY-MM-DD prefix
            "total": {"$sum": "$total"},
        }},
    ]
    daily_totals = {r["_id"]: float(r["total"]) async for r in db.sales.aggregate(daily_pipeline)}
    last_7 = []
    for i in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        key = day.strftime("%Y-%m-%d")
        last_7.append({
            "day": day.strftime("%a"),
            "date": key,
            "total": daily_totals.get(key, 0.0),
        })

    recent_sales = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(8)

    return {
        "products_count": len(products),
        "clients_count": clients_total,
        "total_stock_value": total_stock_value,
        "today_sales_total": today_total,
        "today_sales_count": len(today_sales),
        "week_sales_total": week_total,
        "month_sales_total": month_total,
        "outstanding_debt": outstanding,
        "today_debtors_count": len(today_debtors),
        "suppliers_debt": suppliers_debt,
        "suppliers_debt_orders": sup_debt_orders,
        "suppliers_debt_expenses": sup_debt_expenses,
        "low_stock": low_stock,
        "sales_last_7_days": last_7,
        "recent_sales": recent_sales,
    }

# ---------- Admin Directory ----------
@api_router.get("/admin/clients")
async def admin_clients_directory(user: dict = Depends(require_role("admin"))):
    # Sócios directory: only registered members
    socios = await db.clients.find({"is_member": True}, {"_id": 0, "pin_hash": 0}).sort("name", 1).to_list(5000)
    return socios

# ---------- Notifications ----------
def _build_payment_message(client_doc: dict, payment: dict, total_balance_after: float) -> dict:
    pts = client_doc.get("points", 0)
    member_line = f" (Sócio nº {client_doc.get('member_number')})" if client_doc.get("is_member") and client_doc.get("member_number") else ""
    text = (
        f"Olá {client_doc['name']}{member_line},\n\n"
        f"Recebemos o seu pagamento de {payment['amount']:.2f} € no bar da {CLUB_NAME}.\n"
        f"Saldo em dívida: {max(total_balance_after, 0):.2f} €.\n"
        f"Pontos acumulados: {pts}.\n\n"
        f"Obrigado!\n— {CLUB_NAME}"
    )
    html = (
        f"<div style='font-family:Arial,sans-serif;max-width:520px;color:#111'>"
        f"<div style='background:#15803d;color:#fef3c7;padding:18px 22px;border-radius:8px 8px 0 0'>"
        f"<div style='font-size:12px;letter-spacing:.2em'>ARD · NESPEREIRA</div>"
        f"<div style='font-size:22px;font-weight:700;margin-top:4px'>Recibo de pagamento</div>"
        f"</div>"
        f"<div style='border:1px solid #e5e7eb;border-top:0;padding:22px;border-radius:0 0 8px 8px'>"
        f"<p>Olá <strong>{client_doc['name']}</strong>{member_line},</p>"
        f"<p>Recebemos o seu pagamento de <strong>{payment['amount']:.2f} €</strong>.</p>"
        f"<table style='width:100%;border-collapse:collapse;margin:14px 0'>"
        f"<tr><td style='padding:8px;background:#f9fafb'>Saldo em dívida</td><td style='padding:8px;text-align:right;background:#f9fafb'><strong>{max(total_balance_after,0):.2f} €</strong></td></tr>"
        f"<tr><td style='padding:8px'>Pontos acumulados</td><td style='padding:8px;text-align:right'><strong>{pts} pts</strong></td></tr>"
        f"</table>"
        f"<p style='color:#6b7280;font-size:13px'>Obrigado pela sua preferência.<br/>— {CLUB_NAME}</p>"
        f"</div></div>"
    )
    return {"text": text, "html": html}

@api_router.post("/notify/payment")
async def notify_payment(body: NotifyPaymentIn, user: dict = Depends(get_current_user)):
    payment = await db.payments.find_one({"id": body.payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    c = await db.clients.find_one({"id": payment["client_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    msg = _build_payment_message(c, payment, c.get("balance", 0))
    subject = f"Recibo de pagamento · {CLUB_NAME}"

    channel = body.channel.lower()
    if channel == "email":
        if not c.get("email"):
            raise HTTPException(status_code=400, detail="Cliente não tem email")
        sent = await send_email(c["email"], subject, msg["html"])
        return {
            "channel": "email",
            "sent": sent,
            "to": c["email"],
            "note": "Email enviado." if sent else "Resend não configurado — adiciona RESEND_API_KEY para ativar.",
        }
    if channel == "whatsapp":
        if not c.get("contact"):
            raise HTTPException(status_code=400, detail="Cliente não tem contacto")
        phone = "".join(ch for ch in c["contact"] if ch.isdigit())
        import urllib.parse
        url = f"https://wa.me/{phone}?text={urllib.parse.quote(msg['text'])}"
        return {"channel": "whatsapp", "url": url, "phone": phone}
    if channel == "sms":
        if not c.get("contact"):
            raise HTTPException(status_code=400, detail="Cliente não tem contacto")
        phone = c["contact"]
        import urllib.parse
        url = f"sms:{phone}?body={urllib.parse.quote(msg['text'])}"
        return {"channel": "sms", "url": url, "phone": phone}
    raise HTTPException(status_code=400, detail="Canal inválido")

# ---------- Sócio Portal (self-service) ----------
def create_socio_token(client_id: str, member_number: str) -> str:
    payload = {
        "sub": client_id,
        "member_number": member_number,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "type": "socio",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_socio(request: Request) -> dict:
    token = request.cookies.get("socio_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "socio":
            raise HTTPException(status_code=401, detail="Token inválido")
        c = await db.clients.find_one({"id": payload["sub"]}, {"_id": 0, "pin_hash": 0})
        if not c:
            raise HTTPException(status_code=401, detail="Sócio não encontrado")
        return c
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

@api_router.get("/club/info")
async def club_info():
    return {
        "name": CLUB_NAME,
        "mbway_phone": os.environ.get("CLUB_MBWAY_PHONE", ""),
        "quota_monthly_value": QUOTA_MONTHLY_VALUE,
    }

# ---------- Quotas (cotas mensais) ----------
MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

async def _quotas_status(client_id: str, year: int) -> list:
    """Retorna 12 entradas (uma por mês) com estado pago/em aberto para um sócio."""
    items = await db.quotas.find({"client_id": client_id, "year": year}, {"_id": 0}).to_list(20)
    paid_by_month = {it["month"]: it for it in items}
    out = []
    for m in range(1, 13):
        entry = paid_by_month.get(m)
        out.append({
            "year": year,
            "month": m,
            "label": f"{MONTHS_PT[m-1]}/{year}",
            "amount": QUOTA_MONTHLY_VALUE,
            "status": (entry.get("status") if entry else "open"),
            "paid_at": entry.get("paid_at") if entry else None,
            "sale_id": entry.get("sale_id") if entry else None,
        })
    return out

@api_router.get("/clients/{client_id}/quotas")
async def get_client_quotas(client_id: str, year: Optional[int] = None, user: dict = Depends(get_current_user)):
    if year is None:
        year = datetime.now(timezone.utc).year
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return {"year": year, "client": c, "quotas": await _quotas_status(client_id, year)}

class QuotaPayIn(BaseModel):
    client_id: str
    year: int
    months: List[int]
    payment_method: str = "cash"  # cash | mbway

@api_router.post("/quotas/pay")
async def pay_quotas(body: QuotaPayIn, user: dict = Depends(get_current_user)):
    if not body.months:
        raise HTTPException(status_code=400, detail="Sem meses selecionados")
    c = await db.clients.find_one({"id": body.client_id})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    # Verificar que nenhum mês já está pago
    already = await db.quotas.find({"client_id": body.client_id, "year": body.year, "month": {"$in": body.months}, "status": "paid"}, {"_id": 0}).to_list(20)
    if already:
        raise HTTPException(status_code=400, detail=f"Já pagos: {', '.join(MONTHS_PT[a['month']-1] for a in already)}")
    total = QUOTA_MONTHLY_VALUE * len(body.months)
    sale_id = str(uuid.uuid4())
    items = [{
        "product_id": f"quota-{body.year}-{m:02d}",
        "product_name": f"Cota {MONTHS_PT[m-1]}/{body.year}",
        "unit_price": QUOTA_MONTHLY_VALUE,
        "quantity": 1,
        "subtotal": QUOTA_MONTHLY_VALUE,
    } for m in body.months]
    sale = {
        "id": sale_id,
        "client_id": body.client_id,
        "client_name": c["name"],
        "items": items,
        "total": total,
        "points_earned": 0,
        "is_member_at_sale": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "source": "quota",
    }
    await db.sales.insert_one(sale)
    # registar pagamento imediato (cotas entram como receita pagas, não a crédito)
    pay = {
        "id": str(uuid.uuid4()),
        "client_id": body.client_id,
        "client_name": c["name"],
        "amount": total,
        "points_used": 0,
        "points_value": 0.0,
        "total_credited": total,
        "tendered": total,
        "change_returned": 0.0,
        "keep_change_as_credit": False,
        "note": f"Cotas {body.year}: {', '.join(MONTHS_PT[m-1] for m in body.months)}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "source": f"quota-{body.payment_method}",
        "sale_id": sale_id,
    }
    await db.payments.insert_one(pay)
    # update client total_spent (não mexer no balance pois pagamento cobre 100%)
    await db.clients.update_one({"id": body.client_id}, {"$inc": {"total_spent": total}})
    # marcar cotas pagas
    for m in body.months:
        await db.quotas.update_one(
            {"client_id": body.client_id, "year": body.year, "month": m},
            {"$set": {
                "client_id": body.client_id, "year": body.year, "month": m,
                "status": "paid",
                "amount": QUOTA_MONTHLY_VALUE,
                "paid_at": datetime.now(timezone.utc).isoformat(),
                "sale_id": sale_id,
                "payment_id": pay["id"],
                "user_email": user["email"],
            }},
            upsert=True,
        )
    sale.pop("_id", None)
    pay.pop("_id", None)
    return {"sale": sale, "payment": pay}

@api_router.post("/socio/login")
async def socio_login(body: SocioLoginIn, response: Response):
    mn = body.member_number.strip()
    c = await db.clients.find_one({"member_number": mn}, {"_id": 0})
    if not c or not c.get("pin_hash"):
        raise HTTPException(status_code=401, detail="Nº de sócio ou PIN inválidos")
    if not verify_password(body.pin, c["pin_hash"]):
        raise HTTPException(status_code=401, detail="Nº de sócio ou PIN inválidos")
    token = create_socio_token(c["id"], mn)
    response.set_cookie(
        key="socio_token", value=token, httponly=True, secure=True,
        samesite="none", max_age=60 * 60 * 24 * 30, path="/",
    )
    c.pop("pin_hash", None)
    return {"client": c}

@api_router.post("/socio/logout")
async def socio_logout(response: Response):
    response.delete_cookie("socio_token", path="/")
    return {"ok": True}

@api_router.get("/socio/me")
async def socio_me(socio: dict = Depends(get_current_socio)):
    sales = await db.sales.find({"client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    payments = await db.payments.find({"client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    mbway = await db.mbway_payments.find({"client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"client": socio, "sales": sales, "payments": payments, "mbway": mbway}

@api_router.put("/socio/me")
async def socio_update_me(body: SocioUpdateIn, socio: dict = Depends(get_current_socio)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    await db.clients.update_one({"id": socio["id"]}, {"$set": update})
    c = await db.clients.find_one({"id": socio["id"]}, {"_id": 0, "pin_hash": 0})
    return c

@api_router.post("/socio/mbway-request")
async def socio_mbway_request(body: MBWayRequestIn, socio: dict = Depends(get_current_socio)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    rec = {
        "id": str(uuid.uuid4()),
        "client_id": socio["id"],
        "client_name": socio["name"],
        "amount": float(body.amount),
        "mbway_phone": body.mbway_phone.strip(),
        "note": body.note,
        "status": "pending",  # pending | confirmed | rejected
        "created_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_at": None,
        "confirmed_by": None,
    }
    await db.mbway_payments.insert_one(rec)
    rec.pop("_id", None)
    return rec

@api_router.get("/transactions/{tx_number}")
async def get_transaction(tx_number: int, user: dict = Depends(get_current_user)):
    """Procura uma transação por nº em todas as collections (sale, payment, order, expense)."""
    for coll, kind in [("sales", "sale"), ("payments", "payment"), ("supplier_orders", "order"), ("supplier_expenses", "expense")]:
        doc = await db[coll].find_one({"tx_number": int(tx_number)}, {"_id": 0})
        if doc:
            doc["_kind"] = kind
            return doc
    raise HTTPException(status_code=404, detail="Transação não encontrada")

# ---------- Sócio profile-extra (foto + birthday + bónus 2 pts) ----------
class SocioProfileIn(BaseModel):
    birthday: Optional[str] = None
    photo_data: Optional[str] = None

@api_router.put("/socio/profile-extra")
async def socio_profile_extra(body: SocioProfileIn, socio: dict = Depends(get_current_socio)):
    update = {}
    if body.birthday is not None:
        update["birthday"] = body.birthday
    if body.photo_data is not None:
        if len(body.photo_data) > 1_500_000:
            raise HTTPException(status_code=400, detail="Imagem demasiado grande (máx ~1 MB)")
        update["photo_data"] = body.photo_data
    if not update:
        raise HTTPException(status_code=400, detail="Sem alterações")
    current = await db.clients.find_one({"id": socio["id"]}, {"_id": 0})
    will_bday = bool(update.get("birthday") or current.get("birthday"))
    will_photo = bool(update.get("photo_data") or current.get("photo_data"))
    already = bool(current.get("profile_bonus_given"))
    bonus = 0
    if will_bday and will_photo and not already:
        bonus = 2
        update["profile_bonus_given"] = True
    await db.clients.update_one({"id": socio["id"]}, {"$set": update})
    if bonus:
        await db.clients.update_one({"id": socio["id"]}, {"$inc": {"points": bonus}})
        await _log_points(socio["id"], bonus, "profile_bonus", None, "Perfil completo (data nascimento + foto)", socio.get("email") or "socio-self")
    doc = await db.clients.find_one({"id": socio["id"]}, {"_id": 0, "pin_hash": 0})
    return {"client": doc, "bonus_points": bonus}

# ---------- Staff broadcast para sócio ----------
class StaffToSocioMessageIn(BaseModel):
    client_id: str
    subject: str
    message: str

@api_router.post("/socio-messages/send-to-socio")
async def staff_send_to_socio(body: StaffToSocioMessageIn, user: dict = Depends(require_role("admin", "tesoureiro"))):
    c = await db.clients.find_one({"id": body.client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Sócio não encontrado")
    if not (body.subject.strip() and body.message.strip()):
        raise HTTPException(status_code=400, detail="Assunto e mensagem obrigatórios")
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": body.client_id,
        "client_name": c["name"],
        "member_number": c.get("member_number"),
        "subject": body.subject.strip()[:200],
        "message": body.message.strip()[:5000],
        "status": "from_staff",
        "from_staff": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_by": user["email"],
        "reply": None,
    }
    await db.socio_messages.insert_one(doc)
    doc.pop("_id", None)
    return doc

# ---------- Sócios com cotas em dia (motivacional) ----------
@api_router.get("/socio/members-paid-up")
async def socio_members_paid_up(socio: dict = Depends(get_current_socio)):
    """Lista sócios com cotas em dia — só visível para sócios em DÍVIDA."""
    year = datetime.now(timezone.utc).year
    if not await _socio_has_open_quotas(socio["id"], year):
        # Sócios já em dia não vêem esta lista (não é incentivo para eles)
        return []
    members = await db.clients.find({"is_member": True, "member_number": {"$exists": True, "$ne": None}}, {"_id": 0, "name": 1, "member_number": 1, "id": 1}).to_list(2000)
    out = []
    for m in members:
        qs = await _quotas_status(m["id"], year)
        if all(q["status"] == "paid" for q in qs):
            out.append({"name": m["name"], "member_number": m.get("member_number")})
    return sorted(out, key=lambda x: (x["member_number"] or ""))

@api_router.get("/socio/products")
async def socio_list_products(socio: dict = Depends(get_current_socio)):
    """Lista de produtos disponíveis para o sócio pedir consumo (exclui cotas e sem stock)."""
    items = await db.products.find(
        {"$and": [
            {"$or": [{"is_quota": {"$exists": False}}, {"is_quota": False}]},
            {"quantity": {"$gt": 0}},
        ]},
        {"_id": 0},
    ).sort("name", 1).to_list(1000)
    return items


@api_router.post("/socio/consumption-request")
async def socio_consumption_request(body: SocioConsumptionReqIn, socio: dict = Depends(get_current_socio)):
    if not body.items:
        raise HTTPException(status_code=400, detail="Sem itens")
    pids = [it.product_id for it in body.items]
    prods = await db.products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(len(pids))
    pmap = {p["id"]: p for p in prods}
    line_items = []
    total = 0.0
    for it in body.items:
        prod = pmap.get(it.product_id)
        if not prod:
            raise HTTPException(status_code=404, detail=f"Produto {it.product_id} não encontrado")
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantidade inválida")
        sub = float(prod["price"]) * int(it.quantity)
        total += sub
        line_items.append({
            "product_id": prod["id"],
            "product_name": prod["name"],
            "unit_price": float(prod["price"]),
            "quantity": int(it.quantity),
            "subtotal": sub,
        })
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "client_id": socio["id"],
        "client_name": socio["name"],
        "items": line_items,
        "total": total,
        "note": body.note,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "decided_at": None,
        "decided_by": None,
        "sale_id": None,
    }
    await db.consumption_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/socio/consumption-requests")
async def socio_my_requests(socio: dict = Depends(get_current_socio)):
    items = await db.consumption_requests.find({"client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/socio/points-history")
async def socio_points_history(socio: dict = Depends(get_current_socio)):
    items = await db.points_history.find({"client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    earned = sum(it["delta"] for it in items if it["delta"] > 0)
    spent = sum(-it["delta"] for it in items if it["delta"] < 0)
    return {"items": items, "earned": earned, "spent": spent}

@api_router.get("/socio/quotas")
async def socio_quotas(year: Optional[int] = None, socio: dict = Depends(get_current_socio)):
    if year is None:
        year = datetime.now(timezone.utc).year
    return {"year": year, "quotas": await _quotas_status(socio["id"], year)}

async def _socio_has_open_quotas(client_id: str, year: int) -> bool:
    qs = await _quotas_status(client_id, year)
    return any(q["status"] != "paid" for q in qs)

# ---------- Sócio messages ----------
class SocioMessageIn(BaseModel):
    subject: str
    message: str

@api_router.post("/socio/messages")
async def socio_send_message(body: SocioMessageIn, socio: dict = Depends(get_current_socio)):
    if not body.subject.strip() or not body.message.strip():
        raise HTTPException(status_code=400, detail="Assunto e mensagem obrigatórios")
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": socio["id"],
        "client_name": socio["name"],
        "member_number": socio.get("member_number"),
        "subject": body.subject.strip()[:200],
        "message": body.message.strip()[:5000],
        "status": "open",  # open | replied | archived
        "created_at": datetime.now(timezone.utc).isoformat(),
        "replied_at": None,
        "replied_by": None,
        "reply": None,
    }
    await db.socio_messages.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/socio/messages")
async def socio_my_messages(socio: dict = Depends(get_current_socio)):
    items = await db.socio_messages.find({"client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/socio-messages")
async def staff_list_messages(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: dict = {}
    if status_filter:
        q["status"] = status_filter
    items = await db.socio_messages.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

class SocioMessageReplyIn(BaseModel):
    reply: str

@api_router.post("/socio-messages/{msg_id}/reply")
async def staff_reply_message(msg_id: str, body: SocioMessageReplyIn, user: dict = Depends(get_current_user)):
    msg = await db.socio_messages.find_one({"id": msg_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await db.socio_messages.update_one(
        {"id": msg_id},
        {"$set": {
            "status": "replied",
            "reply": body.reply.strip()[:5000],
            "replied_at": datetime.now(timezone.utc).isoformat(),
            "replied_by": user["email"],
        }},
    )
    return await db.socio_messages.find_one({"id": msg_id}, {"_id": 0})

# ---------- Relatório de contas (Deve / Haver) ----------
async def _finance_summary(date_from: Optional[str], date_to: Optional[str]) -> dict:
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    rng = {}
    if dfrom:
        rng["$gte"] = dfrom
    if dto:
        rng["$lte"] = dto
    sale_q = {"created_at": rng} if rng else {}
    exp_q = {"created_at": rng} if rng else {}
    sales = await db.sales.find(sale_q, {"_id": 0}).sort("created_at", -1).to_list(10000)
    orders = await db.supplier_orders.find(exp_q, {"_id": 0}).sort("created_at", -1).to_list(5000)
    expenses = await db.supplier_expenses.find(exp_q, {"_id": 0}).sort("created_at", -1).to_list(5000)

    sales_consumo = [s for s in sales if s.get("source") != "quota"]
    sales_cotas = [s for s in sales if s.get("source") == "quota"]
    rev_consumo = sum(s.get("total", 0) for s in sales_consumo)
    rev_cotas = sum(s.get("total", 0) for s in sales_cotas)
    rev_total = rev_consumo + rev_cotas

    exp_orders = sum(o.get("total", 0) for o in orders)
    exp_expenses = sum(e.get("amount", 0) for e in expenses)
    exp_total = exp_orders + exp_expenses

    return {
        "period": {"from": date_from, "to": date_to},
        "income": {
            "consumption": rev_consumo,
            "quotas": rev_cotas,
            "total": rev_total,
        },
        "expenses": {
            "supplier_orders": exp_orders,
            "supplier_expenses": exp_expenses,
            "total": exp_total,
        },
        "balance": rev_total - exp_total,
        "counts": {
            "sales": len(sales_consumo),
            "quotas": len(sales_cotas),
            "orders": len(orders),
            "expenses": len(expenses),
        },
        "details": {
            "sales": sales_consumo,
            "quotas": sales_cotas,
            "orders": orders,
            "expenses": expenses,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "club_name": CLUB_NAME,
    }

@api_router.get("/reports/finance")
async def report_finance(date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(require_role("admin", "tesoureiro"))):
    return await _finance_summary(date_from, date_to)

@api_router.get("/socio/finance")
async def socio_finance_summary(date_from: Optional[str] = None, date_to: Optional[str] = None, socio: dict = Depends(get_current_socio)):
    """Resumo para sócios — só visível se cotas do ano em dia."""
    year = datetime.now(timezone.utc).year
    if await _socio_has_open_quotas(socio["id"], year):
        raise HTTPException(status_code=403, detail="Disponível apenas para sócios com cotas em dia")
    data = await _finance_summary(date_from, date_to)
    # Sócio vê apenas totalizadores (sem detalhes nominais)
    return {
        "period": data["period"],
        "income": data["income"],
        "expenses": data["expenses"],
        "balance": data["balance"],
        "counts": data["counts"],
        "generated_at": data["generated_at"],
        "club_name": data["club_name"],
    }

@api_router.get("/socio/can-see-finance")
async def socio_can_see_finance(socio: dict = Depends(get_current_socio)):
    year = datetime.now(timezone.utc).year
    can = not await _socio_has_open_quotas(socio["id"], year)
    return {"can_see": can, "year": year}

class SocioQuotaPayIn(BaseModel):
    year: int
    months: List[int]
    mbway_phone: str

@api_router.post("/socio/quotas/pay")
async def socio_pay_quotas(body: SocioQuotaPayIn, socio: dict = Depends(get_current_socio)):
    """Sócio pede para pagar cotas via MBWay — cria pedido pendente para staff confirmar."""
    if not body.months:
        raise HTTPException(status_code=400, detail="Sem meses selecionados")
    already = await db.quotas.find({"client_id": socio["id"], "year": body.year, "month": {"$in": body.months}, "status": "paid"}, {"_id": 0}).to_list(20)
    if already:
        raise HTTPException(status_code=400, detail=f"Já pagos: {', '.join(MONTHS_PT[a['month']-1] for a in already)}")
    total = QUOTA_MONTHLY_VALUE * len(body.months)
    rec = {
        "id": str(uuid.uuid4()),
        "client_id": socio["id"],
        "client_name": socio["name"],
        "amount": total,
        "mbway_phone": body.mbway_phone.strip(),
        "note": f"Cotas {body.year}: {', '.join(MONTHS_PT[m-1] for m in body.months)}",
        "status": "pending",
        "kind": "quota",
        "quota_year": body.year,
        "quota_months": body.months,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_at": None,
        "confirmed_by": None,
    }
    await db.mbway_payments.insert_one(rec)
    rec.pop("_id", None)
    return rec

# 5 pontos = 1 €
@api_router.post("/socio/pay-with-points")
async def socio_pay_with_points(body: SocioPayPointsIn, socio: dict = Depends(get_current_socio)):
    if body.points <= 0:
        raise HTTPException(status_code=400, detail="Quantidade de pontos inválida")
    if body.points % POINTS_PER_EURO != 0:
        raise HTTPException(status_code=400, detail=f"Os pontos devem ser múltiplos de {POINTS_PER_EURO}")
    current = await db.clients.find_one({"id": socio["id"]}, {"_id": 0, "pin_hash": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Sócio não encontrado")
    available = int(current.get("points", 0))
    if body.points > available:
        raise HTTPException(status_code=400, detail="Pontos insuficientes")
    debt = max(float(current.get("balance", 0)), 0)
    euros = body.points / POINTS_PER_EURO
    if euros > debt + 1e-9:
        raise HTTPException(status_code=400, detail=f"Valor a pagar ({euros:.2f} €) excede a dívida ({debt:.2f} €)")
    pid = str(uuid.uuid4())
    pay = {
        "id": pid,
        "client_id": socio["id"],
        "client_name": socio["name"],
        "amount": float(euros),
        "points_used": int(body.points),
        "note": f"Pagamento com {body.points} pontos",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": socio.get("email") or "socio-self",
        "source": "points",
    }
    await db.payments.insert_one(pay)
    await db.clients.update_one(
        {"id": socio["id"]},
        {"$inc": {"balance": -float(euros), "points": -int(body.points)}},
    )
    await _log_points(socio["id"], -int(body.points), "socio_pay", pay["id"], f"Sócio pagou {euros:.2f} € com pontos", socio.get("email") or "socio-self")
    pay.pop("_id", None)
    return pay

# ---------- MBWay management (staff) ----------
@api_router.get("/mbway-payments")
async def list_mbway_payments(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if status_filter:
        q["status"] = status_filter
    items = await db.mbway_payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.post("/mbway-payments/{mb_id}/confirm")
async def confirm_mbway_payment(mb_id: str, user: dict = Depends(get_current_user)):
    mb = await db.mbway_payments.find_one({"id": mb_id}, {"_id": 0})
    if not mb:
        raise HTTPException(status_code=404, detail="Pedido MBWay não encontrado")
    if mb["status"] != "pending":
        raise HTTPException(status_code=400, detail="Pedido já tratado")
    c = await db.clients.find_one({"id": mb["client_id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    # create actual payment
    pid = str(uuid.uuid4())
    is_quota = mb.get("kind") == "quota"
    # Se é cota: cria também a venda (linha de receita)
    sale_id = None
    if is_quota:
        sale_id = str(uuid.uuid4())
        items = [{
            "product_id": f"quota-{mb['quota_year']}-{m:02d}",
            "product_name": f"Cota {MONTHS_PT[m-1]}/{mb['quota_year']}",
            "unit_price": QUOTA_MONTHLY_VALUE,
            "quantity": 1,
            "subtotal": QUOTA_MONTHLY_VALUE,
        } for m in mb["quota_months"]]
        await db.sales.insert_one({
            "id": sale_id,
            "client_id": mb["client_id"],
            "client_name": mb["client_name"],
            "items": items,
            "total": float(mb["amount"]),
            "points_earned": 0,
            "is_member_at_sale": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "user_email": user["email"],
            "source": "quota",
        })
        await db.clients.update_one({"id": mb["client_id"]}, {"$inc": {"total_spent": float(mb["amount"])}})
        # marcar cotas pagas
        for m in mb["quota_months"]:
            await db.quotas.update_one(
                {"client_id": mb["client_id"], "year": mb["quota_year"], "month": m},
                {"$set": {
                    "client_id": mb["client_id"], "year": mb["quota_year"], "month": m,
                    "status": "paid",
                    "amount": QUOTA_MONTHLY_VALUE,
                    "paid_at": datetime.now(timezone.utc).isoformat(),
                    "sale_id": sale_id,
                    "user_email": user["email"],
                }},
                upsert=True,
            )
    pay = {
        "id": pid,
        "client_id": mb["client_id"],
        "client_name": mb["client_name"],
        "amount": float(mb["amount"]),
        "total_credited": float(mb["amount"]),
        "note": f"MBWay {mb['mbway_phone']}" + (f" · {mb['note']}" if mb.get("note") else ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "source": "mbway-quota" if is_quota else "mbway",
        "mbway_id": mb_id,
    }
    if sale_id:
        pay["sale_id"] = sale_id
    await db.payments.insert_one(pay)
    if not is_quota:
        # Cotas já estão balanceadas (sale + pay = 0); MBWay normal abate dívida existente
        await db.clients.update_one({"id": mb["client_id"]}, {"$inc": {"balance": -float(mb["amount"])}})
    await db.mbway_payments.update_one(
        {"id": mb_id},
        {"$set": {"status": "confirmed", "confirmed_at": datetime.now(timezone.utc).isoformat(), "confirmed_by": user["email"], "payment_id": pid}},
    )
    pay.pop("_id", None)
    return {"ok": True, "payment": pay}

@api_router.post("/mbway-payments/{mb_id}/reject")
async def reject_mbway_payment(mb_id: str, user: dict = Depends(get_current_user)):
    mb = await db.mbway_payments.find_one({"id": mb_id}, {"_id": 0})
    if not mb:
        raise HTTPException(status_code=404, detail="Pedido MBWay não encontrado")
    if mb["status"] != "pending":
        raise HTTPException(status_code=400, detail="Pedido já tratado")
    await db.mbway_payments.update_one(
        {"id": mb_id},
        {"$set": {"status": "rejected", "confirmed_at": datetime.now(timezone.utc).isoformat(), "confirmed_by": user["email"]}},
    )
    return {"ok": True}

# ---------- Suppliers ----------
@api_router.get("/suppliers")
async def list_suppliers(user: dict = Depends(get_current_user)):
    items = await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    if not items:
        return items
    # Batch aggregate counts and outstanding debts in 2 queries instead of 2*N
    sids = [s["id"] for s in items]
    count_pipeline = [
        {"$match": {"supplier_id": {"$in": sids}}},
        {"$group": {"_id": "$supplier_id", "n": {"$sum": 1}}},
    ]
    debt_pipeline = [
        {"$match": {"supplier_id": {"$in": sids}, "paid": False}},
        {"$group": {"_id": "$supplier_id", "outstanding": {"$sum": "$balance_due"}}},
    ]
    counts = {r["_id"]: r["n"] async for r in db.supplier_orders.aggregate(count_pipeline)}
    debts = {r["_id"]: r["outstanding"] async for r in db.supplier_orders.aggregate(debt_pipeline)}
    for s in items:
        s["outstanding"] = float(debts.get(s["id"], 0))
        s["orders_count"] = int(counts.get(s["id"], 0))
    return items

@api_router.post("/suppliers")
async def create_supplier(body: SupplierIn, user: dict = Depends(require_role("admin", "tesoureiro"))):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "name": body.name,
        "contact": body.contact,
        "email": body.email,
        "nif": body.nif,
        "note": body.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.suppliers.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, body: SupplierUpdate, user: dict = Depends(require_role("admin", "tesoureiro"))):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = await db.suppliers.update_one({"id": supplier_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    doc = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    return doc

@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.suppliers.delete_one({"id": supplier_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    return {"ok": True}

@api_router.get("/suppliers/{supplier_id}")
async def supplier_detail(supplier_id: str, user: dict = Depends(get_current_user)):
    s = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    orders = await db.supplier_orders.find({"supplier_id": supplier_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    s["outstanding"] = sum(o.get("balance_due", 0) for o in orders if not o.get("paid"))
    return {"supplier": s, "orders": orders}

# ---------- Supplier Orders (encomendas) ----------
@api_router.post("/supplier-orders")
async def create_supplier_order(body: SupplierOrderIn, user: dict = Depends(require_role("admin", "tesoureiro"))):
    sup = await db.suppliers.find_one({"id": body.supplier_id})
    if not sup:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
    if not body.items:
        raise HTTPException(status_code=400, detail="Sem itens")
    # batch-fetch products
    product_ids = [it.product_id for it in body.items]
    prods_list = await db.products.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(len(product_ids))
    prods_map = {p["id"]: p for p in prods_list}
    line_items = []
    total = 0.0
    for it in body.items:
        prod = prods_map.get(it.product_id)
        if not prod:
            raise HTTPException(status_code=404, detail=f"Produto {it.product_id} não encontrado")
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantidade inválida")
        sub = float(it.unit_cost) * int(it.quantity)
        total += sub
        line_items.append({
            "product_id": prod["id"],
            "product_name": prod["name"],
            "quantity": int(it.quantity),
            "unit_cost": float(it.unit_cost),
            "subtotal": sub,
        })

    # Adicionar stock automaticamente
    for it in body.items:
        await db.products.update_one({"id": it.product_id}, {"$inc": {"quantity": int(it.quantity)}})

    oid = str(uuid.uuid4())
    paid = bool(body.paid)
    tx_no = await _next_tx_number()
    doc = {
        "id": oid,
        "tx_number": tx_no,
        "supplier_id": body.supplier_id,
        "supplier_name": sup["name"],
        "items": line_items,
        "total": total,
        "paid": paid,
        "balance_due": 0.0 if paid else total,
        "amount_paid": total if paid else 0.0,
        "invoice_ref": body.invoice_ref,
        "note": body.note,
        "attachment_name": body.attachment_name,
        "attachment_data": body.attachment_data,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    await db.supplier_orders.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/supplier-orders")
async def list_supplier_orders(supplier_id: Optional[str] = None, only_unpaid: bool = False, user: dict = Depends(get_current_user)):
    q = {}
    if supplier_id:
        q["supplier_id"] = supplier_id
    if only_unpaid:
        q["paid"] = False
    items = await db.supplier_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.post("/supplier-orders/{order_id}/pay")
async def pay_supplier_order(order_id: str, body: SupplierOrderPay, user: dict = Depends(require_role("admin", "tesoureiro"))):
    o = await db.supplier_orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Encomenda não encontrada")
    if o.get("paid"):
        raise HTTPException(status_code=400, detail="Encomenda já paga")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    new_paid_total = float(o.get("amount_paid", 0)) + float(body.amount)
    total = float(o["total"])
    if new_paid_total > total + 1e-9:
        raise HTTPException(status_code=400, detail=f"Valor excede o em dívida ({total - o.get('amount_paid', 0):.2f} €)")
    fully = abs(new_paid_total - total) < 1e-9
    await db.supplier_orders.update_one(
        {"id": order_id},
        {"$set": {
            "amount_paid": new_paid_total,
            "balance_due": max(total - new_paid_total, 0),
            "paid": fully,
            "last_payment_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return await db.supplier_orders.find_one({"id": order_id}, {"_id": 0})

# ---------- Supplier Expenses (recurring/contracts) ----------
@api_router.get("/supplier-expenses")
async def list_supplier_expenses(only_unpaid: bool = False, user: dict = Depends(get_current_user)):
    q = {}
    if only_unpaid:
        q["paid"] = False
    items = await db.supplier_expenses.find(q, {"_id": 0}).sort("due_date", 1).to_list(500)
    return items

@api_router.post("/supplier-expenses")
async def create_supplier_expense(body: SupplierExpenseIn, user: dict = Depends(require_role("admin", "tesoureiro"))):
    sup_name = None
    if body.supplier_id:
        sup = await db.suppliers.find_one({"id": body.supplier_id})
        if not sup:
            raise HTTPException(status_code=404, detail="Fornecedor não encontrado")
        sup_name = sup["name"]
    eid = str(uuid.uuid4())
    tx_no = await _next_tx_number()
    doc = {
        "id": eid,
        "tx_number": tx_no,
        "supplier_id": body.supplier_id,
        "supplier_name": sup_name,
        "description": body.description,
        "amount": float(body.amount),
        "due_date": body.due_date,
        "paid": bool(body.paid),
        "paid_at": body.paid_at if body.paid else None,
        "recurring": body.recurring,
        "note": body.note,
        "attachment_name": body.attachment_name,
        "attachment_data": body.attachment_data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.supplier_expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/supplier-expenses/{expense_id}")
async def update_supplier_expense(expense_id: str, body: SupplierExpenseUpdate, user: dict = Depends(require_role("admin", "tesoureiro"))):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    if "supplier_id" in update and update["supplier_id"]:
        sup = await db.suppliers.find_one({"id": update["supplier_id"]})
        if sup:
            update["supplier_name"] = sup["name"]
    if update.get("paid") is True and not update.get("paid_at"):
        update["paid_at"] = datetime.now(timezone.utc).isoformat()
    if update.get("paid") is False:
        update["paid_at"] = None
    res = await db.supplier_expenses.update_one({"id": expense_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    return await db.supplier_expenses.find_one({"id": expense_id}, {"_id": 0})

@api_router.delete("/supplier-expenses/{expense_id}")
async def delete_supplier_expense(expense_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.supplier_expenses.delete_one({"id": expense_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    return {"ok": True}

# ---------- Bootstrap ----------
@app.on_event("startup")
async def on_startup():
    # indexes
    await db.users.create_index("email", unique=True)
    await db.products.create_index("id", unique=True)
    await db.clients.create_index("id", unique=True)
    await db.sales.create_index("created_at")

    # seed users (admin + tesoureiro + 3 funcionários)
    seed_list = [
        {"email": os.environ.get("ADMIN_EMAIL", "admin@ard.pt").lower(),
         "password": os.environ.get("ADMIN_PASSWORD", "admin123"),
         "name": "Administrador", "role": "admin"},
        {"email": "tesoureiro@ard.pt", "password": "tesoureiro123",
         "name": "Tesoureiro", "role": "tesoureiro"},
        {"email": "func1@ard.pt", "password": "func123",
         "name": "Funcionário 1", "role": "funcionario"},
        {"email": "func2@ard.pt", "password": "func123",
         "name": "Funcionário 2", "role": "funcionario"},
        {"email": "func3@ard.pt", "password": "func123",
         "name": "Funcionário 3", "role": "funcionario"},
    ]
    for u in seed_list:
        existing = await db.users.find_one({"email": u["email"]})
        if existing is None:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": u["email"],
                "name": u["name"],
                "role": u["role"],
                "password_hash": hash_password(u["password"]),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            # keep password in sync with seed config; ensure role is set
            updates = {}
            if existing.get("role") != u["role"]:
                updates["role"] = u["role"]
            if not verify_password(u["password"], existing.get("password_hash", "")):
                updates["password_hash"] = hash_password(u["password"])
            if updates:
                await db.users.update_one({"email": u["email"]}, {"$set": updates})

    # Auto-PIN para todos os sócios com nº de sócio que ainda não têm PIN
    cursor = db.clients.find({"member_number": {"$exists": True, "$ne": None}, "$or": [{"pin_hash": None}, {"pin_hash": {"$exists": False}}]})
    count = 0
    async for c in cursor:
        auto = auto_pin_from_member_number(c.get("member_number"))
        if auto:
            await db.clients.update_one({"id": c["id"]}, {"$set": {"pin_hash": hash_password(auto)}})
            count += 1
    if count:
        logging.getLogger(__name__).info(f"Auto-PIN atribuído a {count} sócios")

    # Backfill tx_number — TODAS as transações têm de ter nº (regra do utilizador)
    from pymongo import ReturnDocument as _RD
    backfill_total = 0
    for coll_name in ("sales", "payments", "supplier_orders", "supplier_expenses"):
        coll = db[coll_name]
        # ordenar por created_at para manter ordem cronológica
        cursor2 = coll.find(
            {"$or": [{"tx_number": {"$exists": False}}, {"tx_number": None}]},
            {"_id": 0, "id": 1, "created_at": 1},
        ).sort("created_at", 1)
        async for doc in cursor2:
            res = await db.counters.find_one_and_update(
                {"_id": "tx"}, {"$inc": {"seq": 1}}, upsert=True, return_document=_RD.AFTER,
            )
            new_no = int(res["seq"]) if res else 1
            await coll.update_one({"id": doc["id"]}, {"$set": {"tx_number": new_no}})
            backfill_total += 1
    if backfill_total:
        logging.getLogger(__name__).info(f"Backfill tx_number: {backfill_total} transações actualizadas")

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

# ---------- Mount ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
