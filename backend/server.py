from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import calendar
import logging
import re
import uuid
import jwt
import bcrypt
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Union
from fastapi import FastAPI, APIRouter, BackgroundTasks, HTTPException, Depends, Request, Response, status
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

ROLES = {"admin", "tesoureiro", "presidente", "funcionario"}
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
    cost_price: float  # preço de custo (aquisição) — sempre indicado à mão; visível só à direção/tesouraria
    quantity: int = 0
    low_stock_threshold: int = 5
    category: Optional[str] = "Bebida"
    image_url: Optional[str] = None
    is_quota: bool = False  # Quotas/cotas — não contam para valor de stock
    is_food: bool = False   # Comida — só disponível entre 16h e 20h
    unavailable: bool = False  # Marcado como indisponível mesmo havendo stock
    is_house_account: bool = False  # "Conta da casa" — venda gratuita, conta como despesa fornecedor
    supplier_id: Optional[str] = None  # fornecedor habitual — usado pela encomenda automática de stock baixo

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    quantity: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    is_quota: Optional[bool] = None
    is_food: Optional[bool] = None
    unavailable: Optional[bool] = None
    is_house_account: Optional[bool] = None
    supplier_id: Optional[str] = None

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
    credit_limit: Optional[float] = None  # teto de fiado (None = sem limite)
    family_head_client_id: Optional[str] = None  # dependente do agregado familiar
    is_minor: bool = False  # menor de idade com tutela de sócio titular
    consumption_limit: Optional[float] = None  # limite de consumo mensal definido pelo titular (€/mês)
    direction_role: Optional[str] = None  # cargo na direção (ex.: "Presidente da Direção")
    direction_history: Optional[List[dict]] = None  # [{role, start_year, end_year}]
    is_honorary: bool = False  # Sócio Honorário 👔 — quota anual (mín. 20 €), convidado automático para eventos
    is_walkin: bool = False  # "Não cliente" — vendas sem nome, editável, sem pontos/cotas/app

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    member_number: Optional[str] = None
    is_member: Optional[bool] = None
    morada: Optional[str] = None
    pin: Optional[str] = None
    credit_limit: Optional[float] = None
    family_head_client_id: Optional[str] = None
    is_minor: Optional[bool] = None
    # "" = limpar o limite (o formulário envia string vazia quando o campo está vazio)
    consumption_limit: Optional[Union[float, str]] = None
    direction_role: Optional[str] = None
    direction_history: Optional[List[dict]] = None
    is_honorary: Optional[bool] = None  # Sócio Honorário 👔
    is_walkin: Optional[bool] = None
    orders_unblocked: Optional[bool] = None  # desbloqueia pedidos na app do sócio (após rejeições)

class OccasionalClientIn(BaseModel):
    label: Optional[str] = None  # nome/alcunha rápida (ex.: "Mesa 2 - casaco preto"); vazio = "Não Cliente #N"

class TransferOccasionalIn(BaseModel):
    target_client_id: str  # cliente/sócio que fica com os consumos da ficha temporária


class SiteContentIn(BaseModel):
    key: str            # identificador estável do texto (ex.: "page.vender.title")
    value: Optional[str] = None  # vazio = repõe o texto original


class SaleItemIn(BaseModel):
    product_id: str
    quantity: int
    house_offer: bool = False  # item marcado como oferta da casa (venda gratuita)

class SaleIn(BaseModel):
    client_id: str
    items: List[SaleItemIn]
    house_offer: bool = False  # carrinho completo como oferta da casa

class SaleEditIn(BaseModel):
    client_id: Optional[str] = None  # se fornecido, transfere a venda para este cliente
    items: Optional[List[SaleItemIn]] = None  # se fornecido, substitui todos os itens
    removal_reason: Optional[str] = None  # motivo da exclusão/desconto de itens (obrigatório p/ funcionários)

class PaymentItemTarget(BaseModel):
    sale_id: str
    product_name: str
    unit_price: float
    qty_pay: int = 0    # quantidade que o cliente paga
    qty_offer: int = 0  # quantidade oferecida pela casa (fica registada como despesa/limite)

class PaymentIn(BaseModel):
    client_id: str
    amount: float
    points_used: int = 0
    note: Optional[str] = None
    keep_change_as_credit: bool = False  # se False, valor abate é capped na dívida
    tip: float = 0.0  # gratificação (parte do amount que NÃO abate à dívida — receita extra)
    sale_ids: Optional[List[str]] = None  # se fornecido, paga apenas estas vendas em específico
    item_targets: Optional[List[PaymentItemTarget]] = None  # seleção por item (pagar/oferecer)

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
    # O sócio pode bloquear os pedidos de pagamento entre sócios
    gifts_blocked: Optional[bool] = None

class MBWayRequestIn(BaseModel):
    amount: float
    mbway_phone: str  # phone used to pay
    note: Optional[str] = None
    use_points: bool = False
    points_to_use: int = 0

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
    payment_source: Optional[str] = None  # "caixa" | "banco" (quando já pago)
    payment_ref: Optional[str] = None  # nº da nota de pagamento
    invoice_ref: Optional[str] = None
    note: Optional[str] = None
    attachment_name: Optional[str] = None  # ex: "fatura-jan.pdf"
    attachment_data: Optional[str] = None  # data URL base64 (image/* | application/pdf), max ~2MB

class SupplierOrderPay(BaseModel):
    amount: float
    note: Optional[str] = None
    payment_source: str = "caixa"  # "caixa" | "banco"
    payment_ref: str  # nº da nota de pagamento — OBRIGATÓRIO

class SupplierExpensePay(BaseModel):
    payment_source: str  # "caixa" | "banco"
    payment_ref: str  # nº da nota de pagamento — OBRIGATÓRIO

class SupplierExpenseIn(BaseModel):
    supplier_id: Optional[str] = None
    description: str  # ex: "Renda", "Eletricidade", "Internet"
    invoice_no: Optional[str] = None  # nº da factura / nota
    amount: float
    due_date: Optional[str] = None  # ISO date string
    paid: bool = False
    paid_at: Optional[str] = None
    recurring: Optional[str] = None  # "monthly" | "yearly" | None
    payment_source: Optional[str] = None  # "caixa" | "banco" (quando já paga)
    payment_ref: Optional[str] = None  # nº da nota de pagamento
    note: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_data: Optional[str] = None

class SupplierExpenseUpdate(BaseModel):
    supplier_id: Optional[str] = None
    description: Optional[str] = None
    invoice_no: Optional[str] = None  # nº da factura / nota
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
    if body.role not in ("admin", "tesoureiro", "presidente", "funcionario"):
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
def _can_see_cost(user: dict) -> bool:
    return user.get("role") in ("admin", "tesoureiro", "presidente")


@api_router.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    # O preço de custo não é visível a funcionários nem sócios
    projection = {"_id": 0} if _can_see_cost(user) else {"_id": 0, "cost_price": 0}
    items = await db.products.find({}, projection).sort("name", 1).to_list(1000)
    return items

@api_router.post("/products")
async def create_product(body: ProductIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    pid = str(uuid.uuid4())
    doc = {
        "id": pid,
        "name": body.name,
        "price": float(body.price),
        # Custo de aquisição — indicado manualmente (a margem resulta do preço de venda)
        "cost_price": round(float(body.cost_price), 2),
        "quantity": int(body.quantity),
        "low_stock_threshold": int(body.low_stock_threshold),
        "category": body.category or "Bebida",
        "image_url": body.image_url,
        "is_quota": bool(body.is_quota),
        "is_food": bool(body.is_food),
        "unavailable": bool(body.unavailable),
        "is_house_account": bool(body.is_house_account),
        "supplier_id": body.supplier_id or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, body: ProductUpdate, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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
async def replenish_stock(body: StockReplenishIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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


class StockWriteOffIn(BaseModel):
    product_id: str
    quantity: int
    reason: str  # danificado | perda | validade | outro
    note: str  # descrição do sucedido — obrigatória
    client_id: Optional[str] = None  # cliente afetado (opcional)


@api_router.post("/stock/writeoffs")
async def create_stock_writeoff(body: StockWriteOffIn, user: dict = Depends(get_current_user)):
    """Baixa de stock por danificado, perda, validade ou outros — com nota obrigatória."""
    prod = await db.products.find_one({"id": body.product_id}, {"_id": 0})
    if not prod:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantidade inválida")
    reason = (body.reason or "").strip().lower()
    if reason not in ("danificado", "perda", "validade", "outro"):
        raise HTTPException(status_code=400, detail="Motivo inválido")
    note = (body.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="Descreve o sucedido")
    client = None
    if body.client_id:
        client = await db.clients.find_one({"id": body.client_id}, {"_id": 0, "name": 1, "member_number": 1})
    tx_no = await _next_tx_number()
    doc = {
        "id": str(uuid.uuid4()),
        "tx_number": tx_no,
        "product_id": prod["id"],
        "product_name": prod["name"],
        "quantity": int(body.quantity),
        "unit_price": float(prod.get("price", 0)),
        "value": round(float(prod.get("price", 0)) * int(body.quantity), 2),
        "reason": reason,
        "note": note[:500],
        "client_id": body.client_id,
        "client_name": client.get("name") if client else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    await db.products.update_one({"id": body.product_id}, {"$inc": {"quantity": -int(body.quantity)}})
    await db.stock_writeoffs.insert_one(doc)
    await _audit(
        "stock_writeoff", user["email"], entity="product", entity_id=prod["id"], tx_number=tx_no,
        summary=f"Baixa de stock #{tx_no} · {body.quantity}× {prod['name']} · {reason} · {note}"
                + (f" · cliente afetado: {client.get('name')}" if client else ""),
    )
    updated = await db.products.find_one({"id": body.product_id}, {"_id": 0})
    doc.pop("_id", None)
    return {"writeoff": doc, "product": updated}


@api_router.get("/stock/writeoffs")
async def list_stock_writeoffs(user: dict = Depends(get_current_user)):
    return await db.stock_writeoffs.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)

# ---------- Clients ----------
@api_router.get("/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    # Fichas temporárias liquidadas ficam arquivadas (só no histórico, não na lista)
    items = await db.clients.find({"archived": {"$ne": True}}, {"_id": 0, "pin_hash": 0}).sort("name", 1).to_list(2000)
    # Enriquecer com resumo de cotas do ano corrente (X/12 pagas) + estado 🟢🟡🔴 — página Clientes unificada
    year = datetime.now(timezone.utc).year
    ids = [c["id"] for c in items]
    quotas = await db.quotas.find(
        {"client_id": {"$in": ids}, "year": year, "status": "paid"},
        {"_id": 0, "client_id": 1},
    ).to_list(50000)
    paid_count: dict = {}
    for q in quotas:
        paid_count[q["client_id"]] = paid_count.get(q["client_id"], 0) + 1
    all_quotas = await db.quotas.find(
        {"client_id": {"$in": ids}}, {"_id": 0}
    ).to_list(200000)
    quotas_by_client: dict = {}
    for q in all_quotas:
        quotas_by_client.setdefault(q.get("client_id"), []).append(q)
    for c in items:
        c["quotas_paid"] = paid_count.get(c["id"], 0)
        c["quotas_total"] = 12
        c["quotas_year"] = year
        c["quotas_up_to_date"] = paid_count.get(c["id"], 0) >= 12
        c["quota_status"] = _quota_status_from_docs(c, quotas_by_client.get(c["id"], [])) if c.get("is_member") else None
        c["has_paid_prev_quota"] = bool(c["quota_status"] and c["quota_status"].get("status") == "paid")
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
    pin_visible = None
    if role in ("admin", "tesoureiro"):
        if body.pin:
            pin_hash = hash_password(body.pin)
            pin_visible = str(body.pin)
        elif member_number:
            auto = auto_pin_from_member_number(member_number)
            if auto:
                pin_hash = hash_password(auto)
                # PIN automático (original) NÃO fica visível na ficha —
                # só fica visível se o sócio o alterar depois.
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
        "pin_visible": pin_visible,
        "points": 0,
        "balance": 0.0,
        "total_spent": 0.0,
        "credit_limit": body.credit_limit,
        "family_head_client_id": body.family_head_client_id if role in ("admin", "tesoureiro") else None,
        "is_minor": bool(body.is_minor) if role in ("admin", "tesoureiro") else False,
        "consumption_limit": body.consumption_limit if role in ("admin", "tesoureiro") else None,
        "direction_role": body.direction_role if role in ("admin", "tesoureiro", "presidente") else None,
        "direction_history": body.direction_history if role in ("admin", "tesoureiro", "presidente") else None,
        "is_honorary": bool(body.is_honorary) if role in ("admin", "tesoureiro") else False,
        "is_walkin": bool(body.is_walkin),
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
    # PIN, is_member, member_number, tutela de menor e limite de consumo só por admin/tesoureiro
    update = dict(raw)
    # Sentinelas de limpeza: "" significa remover — ex.: retirar a tutela do menor ou o limite de consumo
    if update.get("family_head_client_id") == "":
        update["family_head_client_id"] = None
    if update.get("consumption_limit") == "":
        update["consumption_limit"] = None
    elif isinstance(update.get("consumption_limit"), str):
        update["consumption_limit"] = float(update["consumption_limit"].replace(",", "."))
    # Tutela: o titular tem de ser um sócio
    if update.get("family_head_client_id"):
        head = await db.clients.find_one({"id": update["family_head_client_id"]}, {"is_member": 1})
        if not head or not head.get("is_member"):
            raise HTTPException(status_code=400, detail="O titular da tutela tem de ser um sócio")
    sensitive = {"pin", "is_member", "member_number", "is_minor", "family_head_client_id", "orders_unblocked", "is_honorary"}
    if any(k in update for k in sensitive) and user.get("role") not in ("admin", "tesoureiro"):
        raise HTTPException(status_code=403, detail="Sem permissão para alterar estes campos")
    existing_doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing_doc:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    if "pin" in update:
        pin_value = update.pop("pin")
        if pin_value:
            mn = update.get("member_number") or existing_doc.get("member_number")
            auto = auto_pin_from_member_number(mn)
            update["pin_hash"] = hash_password(str(pin_value))
            # PIN visível na ficha só se NÃO for o PIN automático original
            update["pin_visible"] = None if (auto and str(pin_value) == auto) else str(pin_value)
        else:
            update["pin_hash"] = None
            update["pin_visible"] = None
    # Se nº sócio é definido/alterado e não há PIN explícito, gerar automaticamente
    if "member_number" in update and "pin_hash" not in update:
        target_mn = update.get("member_number")
        if target_mn:
            if not (existing_doc and existing_doc.get("pin_hash")):
                auto = auto_pin_from_member_number(target_mn)
                if auto:
                    update["pin_hash"] = hash_password(auto)
                    update["pin_visible"] = None  # PIN automático (original) → não visível
    # Audit: ler o estado antes
    before_doc = existing_doc
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
    # Resposta formal automática no portal do sócio quando o PIN é (re)definido:
    # mesmo que a direção já tenha falado ao telefone, o pedido de recuperação de PIN
    # fica formalmente respondido via app (o sócio vê a resposta no portal).
    if "pin_hash" in update:
        formal_reply = (
            f"Resposta formal da direção: o teu pedido de recuperação de PIN foi tratado. "
            f"O novo PIN já está ativo — entra no portal do sócio com o teu nº de sócio e o novo PIN. "
            f"A direção falou contigo por telefone. Com os melhores cumprimentos, a Direção do {CLUB_NAME}."
        )
        await db.socio_messages.update_many(
            {"client_id": client_id, "status": "open", "subject": {"$regex": "recuperação de PIN", "$options": "i"}},
            {"$set": {
                "status": "replied",
                "reply": formal_reply,
                "replied_at": datetime.now(timezone.utc).isoformat(),
                "replied_by": f"{user.get('email') or user.get('role') or 'direcao'} (resposta formal automática)",
            }},
        )
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
    c = await _maybe_end_tutela(c)
    # PIN visível só para admin/tesoureiro/presidente
    if user.get("role") == "funcionario":
        c.pop("pin_visible", None)
    c["quota_status"] = await _quota_overall_status(client_id)
    c["has_paid_prev_quota"] = bool(c["quota_status"] and c["quota_status"].get("status") == "paid")
    # Histórico de acessos à área de sócio (última vez + lista para consulta da administração)
    c["access_history"] = await db.socio_accesses.find(
        {"client_id": client_id}, {"_id": 0}
    ).sort("at", -1).to_list(50)
    if not c.get("socio_last_access") and c["access_history"]:
        c["socio_last_access"] = c["access_history"][0].get("at")
    # Distintivo / medalha da Tabela de Feitos (último mês distinguido)
    award = await db.ranking_awards.find_one(
        {"client_id": client_id}, {"_id": 0}, sort=[("year", -1), ("month", -1)]
    )
    c["ranking_badge"] = None
    if award:
        c["ranking_badge"] = {
            **award,
            "month_label": f"{MONTHS_FULL_PT[int(award.get('month', 1)) - 1]} {award.get('year')}",
        }
    if c.get("is_minor") or c.get("family_head_client_id"):
        h = await db.clients.find_one({"id": c.get("family_head_client_id")}, {"_id": 0, "name": 1, "member_number": 1})
        c["family_head_name"] = h.get("name") if h else None
        c["family_head_member_number"] = h.get("member_number") if h else None
    sales = await db.sales.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    payments = await db.payments.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Recibos: itens das vendas abatidas por cada pagamento (inclui pagamentos antigos sem item_targets)
    coverage = _allocate_payment_coverages(sales, payments)
    for p in payments:
        p["covered_docs"] = coverage.get(p.get("id"), [])
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
    # Detalhe do "A pagar": vendas ainda não cobertas por pagamentos (FIFO)
    alloc = sum(float(p.get("total_credited", 0) or 0) for p in payments)
    debts = []
    for s in sorted(sales, key=lambda x: x.get("created_at") or ""):
        total_s = float(s.get("total", 0) or 0)
        if total_s <= 0:
            continue
        applied = min(alloc, total_s)
        alloc -= applied
        remaining = round(total_s - applied, 2)
        if remaining > 0.004:
            debts.append({
                "sale_id": s.get("id"),
                "tx_number": s.get("tx_number"),
                "created_at": s.get("created_at"),
                "total": total_s,
                "outstanding": remaining,
                "items": s.get("items") or [],
            })
    return {
        "client": c,
        "sales": sales,
        "payments": payments,
        "debts": debts,
        "consumption": {"day": by_day, "week": by_week, "month": by_month, "year": by_year},
    }

@api_router.get("/clients-with-debt")
async def list_debtors(user: dict = Depends(get_current_user)):
    clients = await db.clients.find({}, {"_id": 0, "pin_hash": 0}).to_list(5000)
    # Épsilon de 0,005 €: resíduos de vírgula flutuante (ex.: 4e-16) não são dívida
    debtors = [c for c in clients if (c.get("balance", 0) > 0.004)]
    # vendas de hoje por cliente (para o filtro "Hoje" por defeito)
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_by_client: dict = {}
    async for s in db.sales.find({"created_at": {"$gte": today_start}}, {"client_id": 1, "total": 1}):
        today_by_client[s["client_id"]] = today_by_client.get(s["client_id"], 0.0) + float(s.get("total", 0))
    # Data da dívida: venda mais antiga ainda por cobrir (imputação FIFO dos pagamentos)
    ids = [c["id"] for c in debtors]
    debt_since: dict = {}
    if ids:
        paid_by_client: dict = {}
        async for p in db.payments.find({"client_id": {"$in": ids}}, {"client_id": 1, "total_credited": 1, "amount": 1}):
            paid_by_client[p["client_id"]] = paid_by_client.get(p["client_id"], 0.0) + float(p.get("total_credited") or p.get("amount") or 0)
        sales_by_client: dict = {}
        async for s in db.sales.find({"client_id": {"$in": ids}}, {"client_id": 1, "total": 1, "created_at": 1}).sort("created_at", 1):
            sales_by_client.setdefault(s["client_id"], []).append(s)
        for cid, slist in sales_by_client.items():
            remaining = paid_by_client.get(cid, 0.0)
            for s in slist:
                total_s = float(s.get("total", 0) or 0)
                if remaining >= total_s - 1e-9:
                    remaining -= total_s
                    continue
                debt_since[cid] = s.get("created_at")
                break
    for c in debtors:
        c["today_sales_total"] = round(today_by_client.get(c["id"], 0.0), 2)
        c["debt_since"] = debt_since.get(c["id"])
    # Apresentada por data da dívida (mais antiga primeiro)
    debtors.sort(key=lambda x: (x.get("debt_since") or "9999", -x.get("balance", 0)))
    return debtors


@api_router.get("/clients-frequent")
async def frequent_clients(limit: int = 7, user: dict = Depends(get_current_user)):
    """Clientes/sócios mais frequentes (nº de vendas) — escolha rápida no Ponto de Venda."""
    limit = min(max(limit, 1), 10)
    counts = await db.sales.aggregate([
        {"$match": {"source": {"$nin": ["quota", "temp_client"]}}},
        {"$group": {"_id": "$client_id", "sales_count": {"$sum": 1}}},
        {"$sort": {"sales_count": -1}},
        {"$limit": limit * 3},
    ]).to_list(limit * 3)
    out = []
    for row in counts:
        c = await db.clients.find_one(
            {"id": row["_id"], "archived": {"$ne": True}},
            {"_id": 0, "pin_hash": 0},
        )
        if not c or c.get("is_temp"):
            continue
        c["sales_count"] = row["sales_count"]
        out.append(c)
        if len(out) >= limit:
            break
    return out

# ---------- Fichas temporárias · Cartão "Não Cliente" (máx. 3 ativas) ----------
OCCASIONAL_MAX_ACTIVE = 3


def _lisbon_today_start_iso() -> str:
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


async def _next_temp_slot() -> Optional[int]:
    """Primeira vaga livre (1..3) entre as fichas temporárias ativas."""
    cards = await db.clients.find({"is_temp": True, "archived": {"$ne": True}}, {"_id": 0, "temp_slot": 1}).to_list(10)
    used = {int(c.get("temp_slot") or 0) for c in cards}
    for slot in range(1, OCCASIONAL_MAX_ACTIVE + 1):
        if slot not in used:
            return slot
    return None


async def _sync_temp_client_state(client_id: str, by: str = "sistema") -> Optional[dict]:
    """Liquidação automática da ficha temporária: a 0,00 € é arquivada (liberta a vaga);
    se voltar a ter dívida (estorno/edição), é reaberta."""
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c or not c.get("is_temp"):
        return c
    balance = round(float(c.get("balance", 0) or 0), 2)
    now_iso = datetime.now(timezone.utc).isoformat()
    if balance > 0.004:
        if c.get("archived"):
            await db.clients.update_one(
                {"id": client_id},
                {"$set": {"archived": False, "archived_at": None, "reopened_at": now_iso}},
            )
            await _audit(
                "temp_client_reopen", by, entity="client", entity_id=client_id,
                summary=f"Ficha temporária reaberta · {c.get('name')} · {balance:.2f} € em dívida",
            )
    elif not c.get("archived"):
        # Só arquiva fichas que já tiveram consumos (uma ficha nova vazia continua aberta)
        has_sales = await db.sales.count_documents({"client_id": client_id}) > 0
        if has_sales:
            await db.clients.update_one(
                {"id": client_id}, {"$set": {"archived": True, "archived_at": now_iso}},
            )
            await _audit(
                "temp_client_archive", by, entity="client", entity_id=client_id,
                summary=f"Venda Não Cliente liquidada · {c.get('name')} · 0,00 € em dívida · ficha temporária arquivada (vaga libertada)",
            )
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@api_router.get("/occasional-clients")
async def list_occasional_clients(user: dict = Depends(get_current_user)):
    """Fichas temporárias ativas (até 3) — cartões de cliente ocasional do bar."""
    cards = await db.clients.find(
        {"is_temp": True, "archived": {"$ne": True}}, {"_id": 0, "pin_hash": 0}
    ).sort("created_at", 1).to_list(OCCASIONAL_MAX_ACTIVE)
    today_start = _lisbon_today_start_iso()
    out = []
    for c in cards:
        sales = await db.sales.find({"client_id": c["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
        out.append({
            **c,
            "items_count": sum(int(it.get("quantity") or 0) for s in sales for it in (s.get("items") or [])),
            "sales_count": len(sales),
            "sales_total": round(sum(float(s.get("total") or 0) for s in sales), 2),
            "today_total": round(sum(float(s.get("total") or 0) for s in sales if (s.get("created_at") or "") >= today_start), 2),
            "last_sale_at": sales[0].get("created_at") if sales else None,
        })
    return {
        "cards": out,
        "limit": OCCASIONAL_MAX_ACTIVE,
        "slots_free": max(OCCASIONAL_MAX_ACTIVE - len(out), 0),
    }


@api_router.post("/occasional-clients")
async def create_occasional_client(body: OccasionalClientIn, user: dict = Depends(get_current_user)):
    slot = await _next_temp_slot()
    if slot is None:
        raise HTTPException(
            status_code=400,
            detail=f"Já existem {OCCASIONAL_MAX_ACTIVE} fichas temporárias ativas — liquida uma para libertar a vaga",
        )
    label = (body.label or "").strip()
    doc = {
        "id": str(uuid.uuid4()),
        "name": label[:60] if label else f"Não Cliente #{slot}",
        "contact": None,
        "email": None,
        "note": "Ficha temporária — cliente ocasional (sem cotas, pontos ou app de sócio)",
        "member_number": None,
        "is_member": False,
        "morada": None,
        "pin_hash": None,
        "pin_visible": None,
        "points": 0,
        "balance": 0.0,
        "total_spent": 0.0,
        "credit_limit": 0.0,
        "family_head_client_id": None,
        "is_minor": False,
        "consumption_limit": None,
        "direction_role": None,
        "direction_history": None,
        "is_walkin": True,
        "is_temp": True,
        "temp_slot": slot,
        "archived": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["email"],
    }
    await db.clients.insert_one(doc)
    await _audit(
        "temp_client_create", user["email"], entity="client", entity_id=doc["id"],
        summary=f"Ficha temporária aberta: {doc['name']} (vaga {slot}/{OCCASIONAL_MAX_ACTIVE})",
    )
    doc.pop("_id", None)
    return doc


@api_router.delete("/occasional-clients/{client_id}")
async def discard_occasional_client(client_id: str, user: dict = Depends(get_current_user)):
    """Fecha o cartão temporário. Sem consumos é eliminado; com consumos liquidados fica arquivado
    (o histórico financeiro mantém-se)."""
    c = await db.clients.find_one({"id": client_id, "is_temp": True}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Ficha temporária não encontrada")
    if round(float(c.get("balance", 0) or 0), 2) > 0.004:
        raise HTTPException(status_code=400, detail="A ficha tem consumos por liquidar — regista o pagamento primeiro")
    has_sales = await db.sales.count_documents({"client_id": client_id}) > 0
    if has_sales:
        await _sync_temp_client_state(client_id, user["email"])
    else:
        await db.clients.delete_one({"id": client_id})
    await _audit(
        "temp_client_discard", user["email"], entity="client", entity_id=client_id,
        summary=f"Ficha temporária fechada: {c.get('name')}",
    )
    return {"ok": True}


@api_router.post("/occasional-clients/{client_id}/transfer")
async def transfer_occasional_client(
    client_id: str, body: TransferOccasionalIn, user: dict = Depends(get_current_user)
):
    """Passa todos os consumos de uma ficha temporária para um sócio/cliente e fecha a ficha."""
    src = await db.clients.find_one({"id": client_id, "is_temp": True}, {"_id": 0, "pin_hash": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Ficha temporária não encontrada")
    target = await db.clients.find_one({"id": body.target_client_id}, {"_id": 0, "pin_hash": 0})
    if not target or target.get("is_temp") or target.get("archived"):
        raise HTTPException(status_code=400, detail="Escolhe um sócio/cliente válido (não uma ficha temporária)")
    if target["id"] == client_id:
        raise HTTPException(status_code=400, detail="A ficha temporária não pode ser transferida para si própria")
    sales = await db.sales.find({"client_id": client_id}, {"_id": 0}).to_list(500)
    if not sales:
        raise HTTPException(status_code=400, detail="Esta ficha ainda não tem consumos para transferir")
    total_moved = 0.0
    points_diff = 0
    for s in sales:
        total_s = float(s.get("total") or 0)
        old_pts = int(s.get("points_earned") or 0)
        target_step = await _points_step_for(target)
        new_pts = int(total_s // target_step) if target_step else 0
        await db.sales.update_one(
            {"id": s["id"]},
            {
                "$set": {
                    "client_id": target["id"],
                    "client_name": target["name"],
                    "points_earned": new_pts,
                    "is_temp_sale": False,
                    "transferred_from_client_id": client_id,
                    "transferred_from_name": src.get("name"),
                    "transferred_at": datetime.now(timezone.utc).isoformat(),
                    "transferred_by": user["email"],
                },
                "$unset": {"source": ""},
            },
        )
        total_moved += total_s
        points_diff += new_pts - old_pts
    inc = {"balance": round(total_moved, 2), "total_spent": round(total_moved, 2)}
    if points_diff:
        inc["points"] = points_diff
    await db.clients.update_one({"id": target["id"]}, {"$inc": inc})
    if points_diff:
        await _log_points(
            target["id"], points_diff, "sale", client_id,
            f"Consumos transferidos da ficha temporária {src.get('name')}", user["email"],
        )
    # A ficha fica sem consumos: elimina o cartão e liberta a vaga
    await db.clients.delete_one({"id": client_id})
    await _audit(
        "temp_client_transfer", user["email"], entity="client", entity_id=target["id"],
        summary=(
            f"{len(sales)} consumo(s) transferidos de {src.get('name')} para {target['name']} · "
            f"{round(total_moved, 2):.2f} € · ficha temporária fechada"
        ),
    )
    target.pop("_id", None)
    return {"ok": True, "moved": len(sales), "total": round(total_moved, 2), "target": target}


# ---------- Textos do portal editáveis pela direção ----------
@api_router.get("/site-content")
async def get_site_content(user: dict = Depends(get_current_user)):
    """Overrides de títulos/frases do portal (só devolve chaves personalizadas)."""
    docs = await db.site_content.find({}, {"_id": 0}).to_list(1000)
    return {d["key"]: d["value"] for d in docs if d.get("key") and d.get("value")}


@api_router.put("/site-content")
async def put_site_content(body: SiteContentIn, user: dict = Depends(require_role("admin"))):
    """Guarda (ou repõe, se o valor vier vazio) o texto de uma chave do portal."""
    key = (body.key or "").strip()
    if not key or len(key) > 120:
        raise HTTPException(status_code=400, detail="Chave de texto inválida")
    value = (body.value or "").strip()
    if not value:
        await db.site_content.delete_one({"key": key})
        await _audit("site_content_reset", user["email"], entity="site_content", entity_id=key,
                     summary=f"Texto reposto ao original: {key}")
        return {"key": key, "value": None}
    await db.site_content.update_one(
        {"key": key},
        {"$set": {
            "key": key,
            "value": value[:500],
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user["email"],
        }},
        upsert=True,
    )
    await _audit("site_content_edit", user["email"], entity="site_content", entity_id=key,
                 summary=f"Texto do portal alterado: {key} → \"{value[:80]}\"")
    return {"key": key, "value": value[:500]}

async def _audit(action_type: str, by: str, *, entity: Optional[str] = None, entity_id: Optional[str] = None, before: Optional[dict] = None, after: Optional[dict] = None, summary: Optional[str] = None, changes: Optional[dict] = None, tx_number: Optional[int] = None):
    """Regista uma entrada genérica no audit log (sempre com descrição e, quando aplicável, nº de transação)."""
    rec = {
        "id": str(uuid.uuid4()),
        "type": action_type,
        "entity": entity,
        "entity_id": entity_id,
        "before": before,
        "after": after,
        "summary": summary or action_type.replace("_", " ").capitalize(),
        "changes": changes or {},
        "tx_number": tx_number,
        "by": by,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_log.insert_one(rec)


def _lisbon_now() -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        return datetime.now(timezone.utc)


BAR_CLOSE_HOUR = 2  # fecho automático às 02:00 (hora de Lisboa)


async def _bar_state() -> dict:
    """Estado efetivo do bar. A abertura é manual; o fecho é automático às 02:00.
    Devolve também o aviso de fecho iminente (10 min antes) e se o bar está fechado."""
    doc = await db.club_state.find_one({"_id": "bar"}, {"_id": 0})
    now = _lisbon_now()
    is_open = bool(doc and doc.get("open"))
    minutes_to_close = None
    # Janela de fecho: 01:50–02:00 avisa; a partir das 02:00 fecha automaticamente
    if is_open:
        close_dt = now.replace(hour=BAR_CLOSE_HOUR, minute=0, second=0, microsecond=0)
        if now.hour >= BAR_CLOSE_HOUR and now.hour < 5:
            is_open = False
        else:
            if now.hour >= 20:  # madrugada do dia seguinte
                close_dt = close_dt + timedelta(days=1)
            minutes_to_close = max(int((close_dt - now).total_seconds() // 60), 0)
    return {
        "open": is_open,
        "closing_soon": bool(is_open and minutes_to_close is not None and 0 < minutes_to_close <= 10),
        "minutes_to_close": minutes_to_close,
        "closes_at": "02:00",
        "now": now.isoformat(),
    }


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


async def _ensure_house_supplier():
    """Garante que existe o 'fornecedor' virtual Conta da Casa."""
    existing = await db.suppliers.find_one({"id": "_house"}, {"_id": 0})
    if not existing:
        await db.suppliers.insert_one({
            "id": "_house",
            "name": "Conta da Casa",
            "code": "F00",
            "contact": None,
            "email": None,
            "nif": None,
            "balance": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


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


async def _points_step_for(client: dict) -> Optional[float]:
    """Euros necessários por ponto, conforme o estado das cotas:
    🟢 em dia → 5 € (sócio honorário: 5 €/1,2 pontos ≈ 4,17 €);
    🟡 por regularizar → 10 €; 🔴 em dívida → não acumula pontos (None)."""
    if not client.get("is_member"):
        return 10.0
    status = (await _quota_overall_status(client.get("id")) or {}).get("status")
    if status == "debt":
        return None
    if status == "pending":
        return 10.0
    return round(5.0 / 1.2, 4) if client.get("is_honorary") else 5.0


async def _compute_points_with_rollover(client: dict, total: float) -> tuple[int, float]:
    """Retorna (points_earned, new_pending_value).
    Sócios acumulam o resto (cêntimos não convertidos) para a próxima compra.
    Não-sócios não fazem rollover."""
    is_member = bool(client.get("is_member"))
    pending = float(client.get("points_pending_value", 0) or 0) if is_member else 0.0
    step = await _points_step_for(client)
    if not step:
        return 0, pending
    effective = pending + float(total)
    pts = int(effective // step)
    new_pending = round(effective - pts * step, 2) if is_member else 0.0
    return pts, new_pending


# ---------- Oferta da casa (limites mensais por utilizador) ----------
HOUSE_OFFER_LIMITS = {"funcionario": 20.0}  # admin/tesoureiro/presidente: 50 €
HOUSE_OFFER_DEFAULT_LIMIT = 50.0

def _lisbon_hour() -> int:
    """Hora local de Portugal (Europe/Lisbon), para janelas horárias (ex.: comida 16h-20h)."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Lisbon")).hour
    except Exception:
        return datetime.now(timezone.utc).hour


def _food_window_open() -> bool:
    """Comida só pode ser pedida/vendida no portal do sócio entre as 16h e as 20h."""
    return 16 <= _lisbon_hour() < 20


async def _house_offer_used_month(email: str) -> float:
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    prefix = f"{now.year}-{now.month:02d}"
    docs = await db.house_offers.find({"user_email": email}, {"_id": 0, "amount": 1, "created_at": 1}).to_list(5000)
    return round(sum(float(d.get("amount") or 0) for d in docs if (d.get("created_at") or "")[:7] == prefix), 2)

async def _house_offer_allowance(user: dict) -> dict:
    limit = HOUSE_OFFER_LIMITS.get(user.get("role"), HOUSE_OFFER_DEFAULT_LIMIT)
    used = await _house_offer_used_month(user["email"])
    return {"limit": limit, "used": used, "remaining": round(max(limit - used, 0.0), 2)}


async def _assert_house_offer_allowed(client_doc: dict):
    """Sócio 🔴 em dívida não pode receber ofertas da casa até regularizar as cotas."""
    if not client_doc.get("is_member"):
        return
    status = await _quota_overall_status(client_doc.get("id"))
    if status and status.get("status") == "debt":
        raise HTTPException(
            status_code=403,
            detail=f"Sócio com quotas em dívida não pode receber ofertas da casa até regularizar ({status.get('amount_due', 0):.2f} €).",
        )

async def _record_house_offers(entries: list, user: dict, client_name: str, member_number: Optional[str] = None):
    """Regista ofertas da casa: histórico (house_offers) + despesa de bar 'Conta da Casa'.
    Na descrição usa o nº de sócio em vez do nome (relatório de contas)."""
    total = round(sum(float(e["amount"]) for e in entries), 2)
    if total <= 0:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    who = f"Sócio nº {member_number}" if member_number else client_name
    await db.house_offers.insert_many([
        {**e, "user_email": user["email"], "user_role": user.get("role"), "client_name": client_name, "created_at": now_iso}
        for e in entries
    ])
    await _ensure_house_supplier()
    expense_tx = await _next_tx_number()
    await db.supplier_expenses.insert_one({
        "id": str(uuid.uuid4()),
        "tx_number": expense_tx,
        "supplier_id": "_house",
        "supplier_name": "Conta da Casa",
        "description": f"Oferta da casa · pagamento em conta corrente · {who} · por {user['email']}",
        "amount": float(total),
        "paid": True,
        "due_date": None,
        "paid_at": now_iso,
        "created_at": now_iso,
        "user_email": user["email"],
        "house_items": entries,
    })

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
    total = 0.0      # valor que o cliente paga
    house_total = 0.0  # valor "conta da casa" (despesa do bar)
    now_hour = datetime.now(timezone.utc).hour
    # Ajustar para hora local PT (CET = UTC+0, mas PT-Continental é normalmente UTC+0 inverno / +1 verão)
    # Usar local time portuguesa simplificada
    try:
        from zoneinfo import ZoneInfo
        now_local = datetime.now(ZoneInfo("Europe/Lisbon"))
        now_hour = now_local.hour
    except Exception:
        pass
    role = user.get("role")
    is_staff = role in ("admin", "tesoureiro")
    for it in body.items:
        prod = products_map.get(it.product_id)
        if not prod:
            raise HTTPException(status_code=404, detail=f"Produto {it.product_id} não encontrado")
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantidade inválida")
        # Comida só entre 16h e 20h, exceto admin/tesoureiro
        if prod.get("is_food") and not is_staff:
            if not (16 <= now_hour < 20):
                raise HTTPException(status_code=400, detail=f"'{prod['name']}' só disponível das 16h às 20h")
        # Marcado como indisponível? funcionário não pode vender; admin/tesoureiro pode
        if prod.get("unavailable") and not is_staff:
            raise HTTPException(status_code=400, detail=f"'{prod['name']}' marcado como indisponível")
        if prod["quantity"] < it.quantity:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {prod['name']}")
        unit_price = float(prod["price"])
        qty = int(it.quantity)
        subtotal_full = unit_price * qty
        # Oferta da casa: flag do produto, do item ou do carrinho completo.
        # Todos os funcionários podem oferecer, sujeito ao limite mensal (validado após o loop).
        item_offer = bool(getattr(it, "house_offer", False)) or bool(body.house_offer)
        is_house = bool(prod.get("is_house_account")) or item_offer
        subtotal = 0.0 if is_house else subtotal_full
        if is_house:
            house_total += subtotal_full
        total += subtotal
        line_items.append({
            "product_id": prod["id"],
            "product_name": prod["name"],
            "unit_price": unit_price,
            "quantity": qty,
            "subtotal": subtotal,
            "is_house_account": is_house,
            "house_value": subtotal_full if is_house else 0.0,
        })

    # Oferta da casa é exclusiva da direção/tesouraria (funcionários não selecionam)
    if house_total > 0 and role not in ("admin", "tesoureiro", "presidente"):
        raise HTTPException(status_code=403, detail="Oferta da casa é exclusiva da direção/tesouraria")
    if house_total > 0:
        await _assert_house_offer_allowed(client_doc)
    # Limite mensal de oferta da casa: funcionário 20 € · admin/tesoureiro/presidente 50 €
    if house_total > 0:
        allowance = await _house_offer_allowance(user)
        if round(allowance["used"] + house_total, 2) > allowance["limit"]:
            raise HTTPException(
                status_code=403,
                detail=f"Limite mensal de oferta da casa excedido ({allowance['used']:.2f} € usados de {allowance['limit']:.2f} € · disponível: {allowance['remaining']:.2f} €)",
            )

    # decrement stock
    for it in body.items:
        await db.products.update_one({"id": it.product_id}, {"$inc": {"quantity": -int(it.quantity)}})

    sale_id = str(uuid.uuid4())
    # Points com rollover (sócios apenas; "não cliente" não acumula pontos)
    is_member = bool(client_doc.get("is_member"))
    old_pending = float(client_doc.get("points_pending_value", 0)) if is_member else 0.0
    points_earned, new_pending = await _compute_points_with_rollover(client_doc, total)
    if client_doc.get("is_walkin") or client_doc.get("is_temp"):
        points_earned, new_pending = 0, old_pending
    tx_no = await _next_tx_number()
    is_tutelado = _is_minor_client(client_doc)
    alcohol_items = [
        li for li in line_items
        if (products_map.get(li["product_id"], {}).get("category") or "") in ALCOHOL_CATEGORIES
    ]
    sale_doc = {
        "id": sale_id,
        "tx_number": tx_no,
        "client_id": body.client_id,
        "client_name": client_doc["name"],
        "items": line_items,
        "total": total,
        "house_total": house_total,
        "house_offer": bool(body.house_offer) or any(li.get("is_house_account") for li in line_items),
        "points_earned": points_earned,
        "points_pending_before": old_pending,
        "points_pending_after": new_pending,
        "is_member_at_sale": is_member,
        "tutelado": is_tutelado,
        "minor_alcohol_alert": bool(is_tutelado and alcohol_items),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    is_temp_sale = bool(client_doc.get("is_temp"))
    if is_temp_sale:
        # Receita de cliente ocasional — categoria própria no histórico/contabilidade
        sale_doc["source"] = "temp_client"
        sale_doc["is_temp_sale"] = True
    await db.sales.insert_one(sale_doc)
    await _audit(
        "sale_create", user["email"], entity="sale", entity_id=sale_id, tx_number=tx_no,
        summary=("Venda Não Cliente" if is_temp_sale else "Venda")
        + f" #{tx_no} · {client_doc['name']} · {total:.2f} € · "
        + ", ".join(f"{li['quantity']}× {li['product_name']}" for li in line_items),
    )
    # Presença na sede: pelo menos um pedido servido no dia
    await _mark_presence(client_doc["id"], source="sale")
    if sale_doc["minor_alcohol_alert"]:
        tutor_id = client_doc.get("family_head_client_id")
        if tutor_id:
            tutor = await db.clients.find_one({"id": tutor_id}, {"_id": 0, "name": 1})
            await db.socio_messages.insert_one({
                "id": str(uuid.uuid4()),
                "client_id": tutor_id,
                "client_name": (tutor or {}).get("name") or "",
                "subject": "⚠️ Bebida alcoólica servida a tutelado",
                "message": f"Foi registada uma bebida alcoólica na conta do teu tutelado {client_doc['name']} (venda #{tx_no}): "
                           + ", ".join(f"{li['quantity']}× {li['product_name']}" for li in alcohol_items),
                "from_staff": True,
                "reply": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        await _audit(
            "minor_alcohol_served", user["email"], entity="sale", entity_id=sale_id, tx_number=tx_no,
            summary=f"Alerta: bebida alcoólica servida a sócio tutelado {client_doc['name']} (venda #{tx_no})",
        )
    if is_tutelado and total > 0 and client_doc.get("family_head_client_id"):
        await db.socio_messages.insert_one({
            "id": str(uuid.uuid4()),
            "client_id": client_doc["family_head_client_id"],
            "client_name": (client_doc.get("family_head_client_id") and client_doc["name"]) or "",
            "subject": "💶 Valor a pagar pelo teu tutelado",
            "message": f"O teu tutelado {client_doc['name']} tem um novo consumo de {total:.2f} € (venda #{tx_no}). "
                       f"Podes regularizar o pagamento na tua App Sócio ou ao balcão.",
            "from_staff": True,
            "reply": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Se houve "conta da casa", regista como despesa de fornecedor (internal)
    if house_total > 0:
        await _ensure_house_supplier()
        expense_tx = await _next_tx_number()
        await db.supplier_expenses.insert_one({
            "id": str(uuid.uuid4()),
            "tx_number": expense_tx,
            "supplier_id": "_house",
            "supplier_name": "Conta da Casa",
            "description": f"Conta da casa · venda #{tx_no} · {client_doc['name']}",
            "amount": float(house_total),
            "paid": True,
            "due_date": None,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "user_email": user["email"],
            "sale_id": sale_id,
            "house_items": [li for li in line_items if li.get("is_house_account")],
        })
        # histórico de ofertas por funcionário (para limites e consulta)
        await db.house_offers.insert_many([
            {
                "product_id": li["product_id"],
                "product_name": li["product_name"],
                "unit_price": float(li["unit_price"]),
                "qty": int(li["quantity"]),
                "amount": round(float(li["house_value"]), 2),
                "user_email": user["email"],
                "user_role": user.get("role"),
                "client_id": body.client_id,
                "client_name": client_doc["name"],
                "sale_id": sale_id,
                "source": "sale",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            for li in line_items if li.get("is_house_account")
        ])

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
    bar = await _bar_state()
    if not bar["open"]:
        sale_doc["bar_warning"] = "O bar está fechado (fecho automático às 02:00) — a venda foi registada. Considera o fecho do bar."
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
            if datetime.now(timezone.utc) - created > timedelta(hours=24):
                raise HTTPException(status_code=403, detail="Funcionários só podem cancelar vendas até 24h após o registo")
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
    await _sync_temp_client_state(sale["client_id"], user["email"])
    # audit log
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "type": "sale_cancel",
        "sale": sale,
        "tx_number": sale.get("tx_number"),
        "by": user["email"],
        "at": datetime.now(timezone.utc).isoformat(),
    })
    await db.sales.delete_one({"id": sale_id})
    await _sync_quota_paid_status(sale["client_id"])
    return {"ok": True, "restored_total": total, "restored_points": pts}

async def _sale_paid_state(sale: dict) -> str:
    """Estado de pagamento de uma venda (imputação FIFO dos pagamentos do cliente)."""
    payments = await db.payments.find(
        {"client_id": sale["client_id"]}, {"_id": 0, "sale_ids": 1, "total_credited": 1, "amount": 1}
    ).to_list(5000)
    targeted = set()
    pool = 0.0
    for p in payments:
        if p.get("sale_ids"):
            targeted.update(p["sale_ids"])
        else:
            pool += float(p.get("total_credited") or p.get("amount") or 0)
    sales = await db.sales.find(
        {"client_id": sale["client_id"]}, {"_id": 0, "id": 1, "total": 1, "created_at": 1}
    ).sort("created_at", 1).to_list(5000)
    for s in sales:
        total_s = float(s.get("total", 0) or 0)
        if s["id"] == sale["id"]:
            if s["id"] in targeted:
                return "paid"
            if pool >= total_s - 1e-9:
                return "paid"
            return "partial" if pool > 1e-9 else "open"
        if s["id"] in targeted:
            continue
        if pool >= total_s - 1e-9:
            pool -= total_s
        elif pool > 1e-9:
            pool = 0.0
    return "open"


@api_router.post("/sales/{sale_id}/removals/{removal_id}/validate")
async def validate_sale_removal(sale_id: str, removal_id: str, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    """Direção valida uma exclusão de itens registada por um funcionário (fica registada na transação)."""
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    removals = sale.get("pending_removals") or []
    found = next((r for r in removals if r.get("id") == removal_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Exclusão não encontrada")
    if found.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Esta exclusão já foi validada")
    for r in removals:
        if r.get("id") == removal_id:
            r["status"] = "validated"
            r["validated_by"] = user["email"]
            r["validated_at"] = datetime.now(timezone.utc).isoformat()
    await db.sales.update_one({"id": sale_id}, {"$set": {"pending_removals": removals}})
    await _audit(
        "sale_removal_validated", user["email"], entity="sale", entity_id=sale_id,
        tx_number=sale.get("tx_number"),
        summary=f"Exclusão de itens validada na venda #{sale.get('tx_number', '—')} (pedida por {found.get('by')})",
    )
    return {"ok": True, "pending_removals": removals}


@api_router.put("/sales/{sale_id}")
async def update_sale(sale_id: str, body: SaleEditIn, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    role = user.get("role")
    # Itens que o pedido está a retirar (quantidades reduzidas ou linhas removidas)
    removing_qty: list = []
    if body.items is not None:
        old_by_pid: dict = {}
        for it in sale["items"]:
            old_by_pid[it["product_id"]] = old_by_pid.get(it["product_id"], 0) + int(it["quantity"])
        new_by_pid: dict = {}
        for it in body.items:
            new_by_pid[it.product_id] = new_by_pid.get(it.product_id, 0) + int(it.quantity)
        for pid, qty in old_by_pid.items():
            if new_by_pid.get(pid, 0) < qty:
                removing_qty.append((pid, qty - new_by_pid.get(pid, 0)))
    # Funcionário: até 24h se serviu a venda; se não foi ele, só em vendas por pagar
    # (e, passados 5 minutos, só pode acrescentar itens / transferir para outro sócio).
    if role == "funcionario":
        try:
            created = datetime.fromisoformat(sale["created_at"].replace("Z", "+00:00"))
            age = datetime.now(timezone.utc) - created
        except (ValueError, KeyError):
            raise HTTPException(status_code=403, detail="Sem permissão para editar esta venda")
        served_by_self = sale.get("user_email") == user["email"]
        if served_by_self:
            if age > timedelta(hours=24):
                raise HTTPException(status_code=403, detail="Funcionários só podem editar vendas até 24 horas após o registo")
        else:
            if await _sale_paid_state(sale) != "open":
                raise HTTPException(status_code=403, detail="Esta venda já foi paga — só o funcionário que a serviu pode editá-la")
            if removing_qty and age > timedelta(minutes=5):
                raise HTTPException(status_code=403, detail="Passaram mais de 5 minutos desde que foi servida: só pode acrescentar itens ou transferir para outro sócio")
        if removing_qty and not (body.removal_reason or "").strip():
            raise HTTPException(status_code=400, detail="Indica o motivo da exclusão dos itens")
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
    points_step = await _points_step_for(new_client)
    new_points = int(new_total // points_step) if points_step else 0

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

    # Fichas temporárias envolvidas na edição (pagamento/transferência)
    await _sync_temp_client_state(new_client_id, user["email"])
    if new_client_id != sale["client_id"]:
        await _sync_temp_client_state(sale["client_id"], user["email"])

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
    if removing_qty:
        names = {it["product_id"]: it["product_name"] for it in sale["items"]}
        changes["removed"] = [f"{q}× {names.get(pid, pid)}" for pid, q in removing_qty]
        if body.removal_reason:
            changes["removal_reason"] = body.removal_reason.strip()
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "type": "sale_edit",
        "sale_id": sale_id,
        "tx_number": sale.get("tx_number"),
        "client_id": new_client_id,
        "client_name": new_client["name"],
        "changes": changes,
        "before": sale,
        "by": user["email"],
        "at": datetime.now(timezone.utc).isoformat(),
    })
    # Exclusões feitas por funcionários ficam pendentes de validação da direção
    if role == "funcionario" and removing_qty:
        names = {it["product_id"]: it["product_name"] for it in sale["items"]}
        await db.sales.update_one({"id": sale_id}, {"$push": {"pending_removals": {
            "id": str(uuid.uuid4()),
            "items": [{"product_id": pid, "product_name": names.get(pid, pid), "quantity": q} for pid, q in removing_qty],
            "reason": body.removal_reason.strip(),
            "by": user["email"],
            "at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
        }}})
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
    await _sync_quota_paid_status(new_client_id)
    return await db.sales.find_one({"id": sale_id}, {"_id": 0})

# ---------- Devolução de crédito (dinheiro a favor do cliente) ----------
@api_router.post("/clients/{client_id}/refund-credit")
async def refund_client_credit(client_id: str, user: dict = Depends(require_role("admin", "tesoureiro"))):
    """Devolve em numerário ao cliente o crédito que tem a favor (saldo negativo → 0)."""
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    credit = round(-float(c.get("balance", 0) or 0), 2)
    if credit <= 0.004:
        raise HTTPException(status_code=400, detail="O cliente não tem crédito a favor para devolver")
    # Origem do crédito devolvido (transações e itens que o geraram) — detalhe da nota de crédito
    origins = []
    items_detail = []
    credit_pays = await db.payments.find(
        {"client_id": client_id, "source": {"$ne": "refund"}},
        {"_id": 0, "id": 1, "tx_number": 1, "created_at": 1, "total_credited": 1, "sale_ids": 1, "keep_change_as_credit": 1},
    ).sort("created_at", -1).to_list(200)
    for p in credit_pays[:20]:
        lines = []
        if p.get("sale_ids"):
            covered = await db.sales.find({"id": {"$in": p["sale_ids"]}}, {"_id": 0, "items": 1}).to_list(50)
            for s in covered:
                for it in s.get("items", []):
                    lines.append({"product_name": it.get("product_name"), "quantity": it.get("quantity"), "unit_price": it.get("unit_price"), "subtotal": it.get("subtotal")})
        origins.append({
            "tx_number": p.get("tx_number"),
            "date": p.get("created_at"),
            "amount": float(p.get("total_credited") or 0),
            "kept_as_credit": bool(p.get("keep_change_as_credit")),
        })
        for ln in lines:
            if ln not in items_detail:
                items_detail.append(ln)
    pay = {
        "id": str(uuid.uuid4()),
        "tx_number": await _next_tx_number(),
        "client_id": client_id,
        "client_name": c["name"],
        "amount": credit,
        "tendered": 0.0,
        "total_credited": 0.0,  # não abate dívida — é uma devolução de dinheiro
        "change_returned": 0.0,
        "points_used": 0,
        "points_value": 0.0,
        "note": "Devolução de crédito em numerário",
        "source": "refund",
        "credit_origins": origins,
        "credit_items": items_detail,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    await db.payments.insert_one(pay)
    # Saldo negativo (crédito) volta a 0
    await db.clients.update_one({"id": client_id}, {"$inc": {"balance": credit}})
    # A devolução sai em numerário da gaveta — reduz o valor em caixa e
    # fica nas transações/movimentações de caixa (kind credit_refund)
    wd = {
        "id": str(uuid.uuid4()),
        "tx_number": await _next_tx_number(),
        "kind": "credit_refund",
        "client_id": client_id,
        "client_name": c["name"],
        "amount": credit,
        "note": "Devolução de crédito em numerário",
        "created_at": pay["created_at"],
        "user_email": user["email"],
        "user_role": user.get("role"),
    }
    await db.cash_withdrawals.insert_one(wd)
    await db.club_state.update_one({"_id": "bar"}, {"$inc": {"cash_in_drawer": -credit}})
    await _audit(
        "credit_refund", user["email"], entity="client", entity_id=client_id, tx_number=pay["tx_number"],
        summary=f"Devolução de crédito de {credit:.2f} € em numerário a {c['name']} · nota de crédito #{pay['tx_number']} (saída de caixa #{wd['tx_number']})",
    )
    pay.pop("_id", None)
    return pay

# ---------- Sales Report (filtros) ----------
@api_router.get("/reports/sales")
async def report_sales(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_email: Optional[str] = None,
    client_id: Optional[str] = None,
    status_filter: Optional[str] = None,  # "paid" | "open" | None
    user: dict = Depends(require_role("admin", "tesoureiro", "presidente")),
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
    search: Optional[str] = None,
    limit: int = 500,
    user: dict = Depends(require_role("admin", "tesoureiro", "presidente")),
):
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    q: dict = {}
    if user_email:
        q["by"] = user_email
    if event_type:
        q["type"] = event_type
    # Pesquisa livre: nome, nº de sócio, funcionário, referência ou nº de transação
    text = (search or "").strip()
    if text:
        rx = {"$regex": re.escape(text), "$options": "i"}
        ors = [{"summary": rx}, {"by": rx}, {"entity_id": rx}]
        digits = text.lstrip("#")
        if digits.isdigit():
            ors.append({"tx_number": int(digits)})
        # Fichas cujo nome ou nº de sócio corresponde → entradas ligadas a esse cliente
        matched_clients = await db.clients.find(
            {"$or": [{"name": rx}, {"member_number": rx}]}, {"id": 1, "name": 1}
        ).to_list(500)
        if matched_clients:
            ids = [c["id"] for c in matched_clients]
            ors.append({"entity_id": {"$in": ids}})
            names = [re.escape(c.get("name") or "") for c in matched_clients if c.get("name")]
            if names:
                ors.append({"summary": {"$regex": "|".join(names), "$options": "i"}})
        q["$or"] = ors
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
    use_points: bool = False  # o sócio marcou que quer descontar pontos no pagamento

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
    # Validar stock + atualizar (itens de cota 'quota-YYYY-MM' não são produtos)
    pids = [it["product_id"] for it in req["items"] if not str(it["product_id"]).startswith("quota-")]
    prods = await db.products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(len(pids))
    pmap = {p["id"]: p for p in prods}
    for it in req["items"]:
        if str(it["product_id"]).startswith("quota-"):
            continue
        prod = pmap.get(it["product_id"])
        if not prod:
            raise HTTPException(status_code=400, detail=f"Produto {it['product_name']} foi removido")
        if prod["quantity"] < it["quantity"]:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {prod['name']}")
    for it in req["items"]:
        if str(it["product_id"]).startswith("quota-"):
            continue
        await db.products.update_one({"id": it["product_id"]}, {"$inc": {"quantity": -int(it["quantity"])}})
    # Criar venda
    sale_id = str(uuid.uuid4())
    tx_no = await _next_tx_number()
    is_member = bool(client_doc.get("is_member"))
    old_pending = float(client_doc.get("points_pending_value", 0)) if is_member else 0.0
    points_earned, new_pending = await _compute_points_with_rollover(client_doc, req["total"])
    sale_doc = {
        "id": sale_id,
        "tx_number": tx_no,
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
        "use_points_requested": bool(req.get("use_points_requested")),
    }
    await db.sales.insert_one(sale_doc)
    # Cotas incluídas no pedido ficam 'billed' (na conta corrente) e apontam à venda gerada
    for it in req["items"]:
        pid = str(it["product_id"])
        if pid.startswith("quota-"):
            parts = pid.split("-")
            try:
                qy, qm = int(parts[1]), int(parts[2])
            except (IndexError, ValueError):
                continue
            await db.quotas.update_one(
                {"client_id": req["client_id"], "year": qy, "month": qm},
                {"$set": {"client_id": req["client_id"], "year": qy, "month": qm, "amount": _quota_amount(client_doc), "status": "billed", "sale_id": sale_id}},
                upsert=True,
            )
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
    # Notificação ao sócio: o pedido pode ser levantado ao balcão
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": req["client_id"],
        "client_name": req["client_name"],
        "subject": "✅ Pedido aprovado — pronto ao balcão",
        "message": f"O teu pedido ({euro_fmt(req['total'])}) foi aceite pelo staff. Podes levantá-lo ao balcão.",
        "from_staff": True,
        "reply": None,
        "request_id": req_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
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
    # Notificação ao sócio: o pedido foi recusado
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": req["client_id"],
        "client_name": req["client_name"],
        "subject": "❌ Pedido recusado",
        "message": f"O teu pedido ({euro_fmt(req['total'])}) foi recusado pelo staff. Fala com o balcão se tiveres dúvidas.",
        "from_staff": True,
        "reply": None,
        "request_id": req_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    client_doc = await db.clients.find_one({"id": req["client_id"]}, {"_id": 0})
    if client_doc:
        blocked, rejected = await _client_orders_blocked(client_doc)
        if blocked:
            await db.socio_messages.insert_one({
                "id": str(uuid.uuid4()),
                "client_id": req["client_id"],
                "client_name": req["client_name"],
                "subject": "🚫 Pedidos bloqueados na app",
                "message": f"Após {rejected} pedidos rejeitados, os pedidos pela app ficaram bloqueados. Pede à direção para desbloquear na tua ficha.",
                "from_staff": True,
                "reply": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            await _audit(
                "socio_orders_blocked", user["email"], entity="client", entity_id=req["client_id"],
                summary=f"Pedidos na app bloqueados por {rejected} rejeições · {req['client_name']}",
            )
    return {"ok": True}

class ConsumptionReqEditIn(BaseModel):
    items: List[SaleItemIn]
    note: Optional[str] = None

@api_router.put("/consumption-requests/{req_id}")
async def staff_edit_consumption_request(req_id: str, body: ConsumptionReqEditIn, user: dict = Depends(get_current_user)):
    """Staff pode editar itens / nota de um pedido ainda pendente, antes de o aprovar."""
    req = await db.consumption_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Pedido já tratado")
    if not body.items:
        raise HTTPException(status_code=400, detail="Sem itens")
    line_items = await _build_request_line_items(body.items, req["client_id"])
    total = round(sum(li["subtotal"] for li in line_items), 2)
    await _check_credit_limit(req["client_id"], total)
    await db.consumption_requests.update_one(
        {"id": req_id},
        {"$set": {
            "items": line_items,
            "total": total,
            "note": body.note,
            "edited_at": datetime.now(timezone.utc).isoformat(),
            "edited_by": user["email"],
            "edited_by_staff": True,
        }},
    )
    return await db.consumption_requests.find_one({"id": req_id}, {"_id": 0})

@api_router.post("/consumption-requests/{req_id}/notify-pickup")
async def notify_request_pickup(req_id: str, user: dict = Depends(get_current_user)):
    """Notifica o sócio de que o pedido aprovado já pode ser levantado no balcão."""
    req = await db.consumption_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req["status"] != "approved":
        raise HTTPException(status_code=400, detail="Só pedidos aprovados podem ser notificados para levantamento")
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": req["client_id"],
        "client_name": req["client_name"],
        "subject": "📦 Podes levantar o pedido no balcão",
        "message": f"O teu pedido ({euro_fmt(req['total'])}) já está pronto — passa no balcão para o levantar.",
        "from_staff": True,
        "reply": None,
        "request_id": req_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.consumption_requests.update_one(
        {"id": req_id},
        {"$set": {"notified_pickup_at": datetime.now(timezone.utc).isoformat(), "notified_pickup_by": user["email"]}},
    )
    await _audit("request_notify_pickup", user["email"], entity="consumption_request", entity_id=req_id,
                 summary=f"Notificado levantamento no balcão · {req['client_name']} · {euro_fmt(req['total'])}")
    return {"ok": True}

@api_router.post("/consumption-requests/{req_id}/deliver")
async def deliver_consumption_request(req_id: str, user: dict = Depends(get_current_user)):
    """Marca o pedido aprovado como ENTREGUE no balcão — o valor fica na conta
    corrente do sócio, pronto para pagamento."""
    req = await db.consumption_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req["status"] == "delivered":
        raise HTTPException(status_code=400, detail="Pedido já foi entregue")
    if req["status"] != "approved":
        raise HTTPException(status_code=400, detail="Só pedidos aprovados podem ser dados como entregues")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.consumption_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "delivered", "delivered_at": now_iso, "delivered_by": user["email"]}},
    )
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": req["client_id"],
        "client_name": req["client_name"],
        "subject": "✅ Pedido entregue — pronto para pagamento",
        "message": f"O teu pedido ({euro_fmt(req['total'])}) foi entregue no balcão. O valor ({euro_fmt(req['total'])}) está na tua conta corrente, pronto para pagamento.",
        "from_staff": True,
        "reply": None,
        "request_id": req_id,
        "created_at": now_iso,
    })
    await _audit("request_deliver", user["email"], entity="consumption_request", entity_id=req_id,
                 summary=f"Pedido entregue no balcão · {req['client_name']} · {euro_fmt(req['total'])} · pronto para pagamento")
    # Pedido servido = presença do dia na sede
    await _mark_presence(req["client_id"], source="request")
    return {"ok": True}

async def _reverse_request_sale(req: dict, by: str, reason: str):
    """Estorna a venda gerada por um pedido: repõe stock, anula o valor na conta
    do sócio e retira os pontos ganhos."""
    sale_id = req.get("sale_id")
    if not sale_id:
        return 0.0
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        return 0.0
    for it in sale.get("items", []):
        if str(it.get("product_id", "")).startswith("quota-"):
            continue
        await db.products.update_one({"id": it["product_id"]}, {"$inc": {"quantity": int(it["quantity"])}})
    total = float(sale.get("total", 0))
    pts = int(sale.get("points_earned", 0) or 0)
    inc = {"balance": -total, "total_spent": -total}
    if pts:
        inc["points"] = -pts
    op: dict = {"$inc": inc}
    if "points_pending_before" in sale:
        op["$set"] = {"points_pending_value": float(sale["points_pending_before"])}
    await db.clients.update_one({"id": sale["client_id"]}, op)
    if pts:
        await _log_points(sale["client_id"], -pts, "sale_cancel", sale_id, f"Pedido anulado · {reason}", by)
    await db.quotas.delete_many({"client_id": sale["client_id"], "sale_id": sale_id, "status": "billed"})
    await db.sales.delete_one({"id": sale_id})
    await _sync_temp_client_state(sale["client_id"], by)
    await _sync_quota_paid_status(sale["client_id"])
    return total


async def _cancel_request(req: dict, by: str, reason: str, *, automatic: bool = False):
    """Anula um pedido: estorna a venda (stock + conta corrente) e avisa o sócio."""
    await _reverse_request_sale(req, by, reason)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.consumption_requests.update_one(
        {"id": req["id"]},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": now_iso,
            "cancelled_by": by,
            "cancel_reason": reason,
            "cancelled_automatically": bool(automatic),
        }},
    )
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": req["client_id"],
        "client_name": req.get("client_name"),
        "subject": "↩️ Pedido anulado",
        "message": f"O teu pedido ({euro_fmt(req.get('total') or 0)}) foi anulado. {reason} O valor foi retirado da tua conta corrente e o stock reposto.",
        "from_staff": True,
        "reply": None,
        "request_id": req["id"],
        "created_at": now_iso,
    })
    await _audit("request_cancel", by, entity="consumption_request", entity_id=req["id"],
                 summary=f"Pedido anulado · {req.get('client_name')} · {euro_fmt(req.get('total') or 0)} · {reason}")


class RequestCancelIn(BaseModel):
    reason: Optional[str] = None


@api_router.post("/consumption-requests/{req_id}/cancel")
async def cancel_consumption_request(req_id: str, body: Optional[RequestCancelIn] = None, user: dict = Depends(get_current_user)):
    """Anula um pedido (pendente, pronto a levantar ou entregue): estorna a venda,
    anula o valor na conta do sócio e repõe o stock."""
    req = await db.consumption_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req.get("status") not in ("pending", "approved", "delivered"):
        raise HTTPException(status_code=400, detail="Este pedido já não pode ser anulado")
    reason = (body.reason if body and body.reason else "").strip() or f"Anulado por {user['email']}"
    await _cancel_request(req, user["email"], reason)
    return {"ok": True}


# Anulação automática: pedido pronto a levantar, notificação lida e nada recolhido em 10 min
PICKUP_AUTO_CANCEL_MINUTES = 10


async def _auto_cancel_uncollected_requests():
    limit = (datetime.now(timezone.utc) - timedelta(minutes=PICKUP_AUTO_CANCEL_MINUTES)).isoformat()
    async for req in db.consumption_requests.find(
        {"status": "approved", "pickup_read_at": {"$lte": limit}}, {"_id": 0}
    ):
        await _cancel_request(
            req, "sistema",
            f"O sócio leu o aviso de levantamento e não recolheu o pedido em {PICKUP_AUTO_CANCEL_MINUTES} minutos.",
            automatic=True,
        )


async def _pickup_autocancel_loop():
    """Verifica a cada minuto os pedidos prontos a levantar já lidos e não recolhidos."""
    while True:
        try:
            await _auto_cancel_uncollected_requests()
        except Exception:
            logging.getLogger(__name__).exception("Falha na anulação automática de pedidos")
        await asyncio.sleep(60)


# ---------- Payments ----------
@api_router.post("/payments")
async def create_payment(body: PaymentIn, user: dict = Depends(get_current_user)):
    if body.amount < 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    if body.tip < 0 or body.tip > body.amount:
        raise HTTPException(status_code=400, detail="Gratificação inválida")
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
    tip = round(float(body.tip), 2)
    cash_effective = round(float(body.amount) - tip, 2)  # parte do cash que abate à dívida
    total_paid_raw = cash_effective + points_euros
    # O valor a pagar pode ser ZERO (ex.: regularização sem numerário / oferta)
    # Seleção por item: quantidades a pagar / a oferecer (oferta da casa)
    offer_amount = 0.0
    if body.item_targets:
        target_amount = 0.0
        prior = {}
        past = await db.payments.find(
            {"client_id": body.client_id, "item_targets": {"$exists": True, "$ne": None}},
            {"_id": 0, "item_targets": 1},
        ).to_list(5000)
        for pp in past:
            for t in (pp.get("item_targets") or []):
                key = (t["sale_id"], t["product_name"])
                prior[key] = prior.get(key, 0) + int(t.get("qty_pay", 0)) + int(t.get("qty_offer", 0))
        sales_docs = await db.sales.find(
            {"id": {"$in": sorted({t.sale_id for t in body.item_targets})}, "client_id": body.client_id},
            {"_id": 0},
        ).to_list(100)
        smap = {s["id"]: s for s in sales_docs}
        for t in body.item_targets:
            s = smap.get(t.sale_id)
            if not s:
                raise HTTPException(status_code=400, detail="Venda alvo não encontrada")
            line = next((li for li in s.get("items", []) if li["product_name"] == t.product_name), None)
            if line is None or line.get("is_house_account"):
                raise HTTPException(status_code=400, detail=f"Item inválido: {t.product_name}")
            avail = int(line["quantity"]) - int(prior.get((t.sale_id, t.product_name), 0))
            if t.qty_pay < 0 or t.qty_offer < 0 or t.qty_pay + t.qty_offer <= 0 or t.qty_pay + t.qty_offer > avail:
                raise HTTPException(status_code=400, detail=f"Quantidade indisponível para {t.product_name} (disponível: {max(avail, 0)})")
            target_amount += float(t.unit_price) * t.qty_pay
            offer_amount += float(t.unit_price) * t.qty_offer
        target_amount = round(target_amount, 2)
        offer_amount = round(offer_amount, 2)
        if offer_amount > 0:
            if user.get("role") not in ("admin", "tesoureiro", "presidente"):
                raise HTTPException(status_code=403, detail="Oferta da casa é exclusiva da direção/tesouraria")
            await _assert_house_offer_allowed(c)
            allowance = await _house_offer_allowance(user)
            if round(allowance["used"] + offer_amount, 2) > allowance["limit"]:
                raise HTTPException(
                    status_code=403,
                    detail=f"Limite mensal de oferta da casa excedido ({allowance['used']:.2f} € usados de {allowance['limit']:.2f} € · disponível: {allowance['remaining']:.2f} €)",
                )
    # Cálculo do target (seleção por item, vendas específicas ou dívida total)
    sale_ids_clean: list = []
    if body.item_targets:
        sale_ids_clean = sorted({t.sale_id for t in body.item_targets})
    elif body.sale_ids:
        target_sales = await db.sales.find(
            {"id": {"$in": body.sale_ids}, "client_id": body.client_id},
            {"_id": 0, "id": 1, "total": 1},
        ).to_list(len(body.sale_ids))
        sale_ids_clean = [s["id"] for s in target_sales]
        target_amount = round(sum(float(s["total"]) for s in target_sales), 2)
    else:
        target_amount = max(float(c.get("balance", 0)), 0.0)
    if not body.keep_change_as_credit and total_paid_raw > target_amount:
        total_paid = target_amount
        change_returned = round(total_paid_raw - target_amount, 2)
    else:
        total_paid = total_paid_raw
        change_returned = 0.0
    pid = str(uuid.uuid4())
    tx_no = await _next_tx_number()
    points_value = round(points_euros, 2)
    # nºs de transação das vendas cobertas (para recibo)
    sale_tx_numbers = []
    if sale_ids_clean:
        covered = await db.sales.find({"id": {"$in": sale_ids_clean}}, {"_id": 0, "tx_number": 1}).to_list(len(sale_ids_clean))
        sale_tx_numbers = sorted(s.get("tx_number") for s in covered if s.get("tx_number"))
    pay = {
        "id": pid,
        "tx_number": tx_no,
        "client_id": body.client_id,
        "client_name": c["name"],
        "amount": float(body.amount),              # numerário entregue (cash bruto, inclui tip)
        "tendered": round(float(body.amount), 2),  # numerário entregue (apenas cash — pontos abatem à dívida, não são dinheiro entregue)
        "points_used": int(body.points_used or 0),
        "points_value": points_value,
        "total_credited": round(total_paid + offer_amount, 2),  # valor abatido à dívida (pago + oferta)
        "change_returned": change_returned,
        "keep_change_as_credit": bool(body.keep_change_as_credit),
        "tip": tip,                                # gratificação (receita extra)
        "sale_ids": sale_ids_clean,                # vendas específicas (vazio = FIFO)
        "sale_tx_numbers": sale_tx_numbers,        # nºs das vendas cobertas (recibo)
        "item_targets": (
            [
                {"sale_id": t.sale_id, "product_name": t.product_name, "unit_price": float(t.unit_price), "qty_pay": t.qty_pay, "qty_offer": t.qty_offer}
                for t in body.item_targets
            ]
            if body.item_targets
            else None
        ),
        "offer_amount": offer_amount,              # parte da oferta da casa (despesa do bar)
        "note": body.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "source": "points+cash" if (body.points_used and body.amount) else ("points" if body.points_used else "cash"),
    }
    await db.payments.insert_one(pay)
    # Regista nas vendas cobertas o que foi oferecido pela casa — o recibo da venda
    # passa a mostrar a oferta e o valor realmente pago pelo cliente
    if body.item_targets:
        for sid in sale_ids_clean:
            offer_lines = [
                {
                    "product_name": t.product_name,
                    "quantity": int(t.qty_offer),
                    "unit_price": float(t.unit_price),
                    "amount": round(float(t.unit_price) * int(t.qty_offer), 2),
                }
                for t in body.item_targets if t.sale_id == sid and int(t.qty_offer) > 0
            ]
            if offer_lines:
                await db.sales.update_one(
                    {"id": sid},
                    {"$set": {
                        "payment_offer_items": offer_lines,
                        "payment_offer_amount": round(sum(o["amount"] for o in offer_lines), 2),
                        "payment_tx_number": tx_no,
                        "payment_offer_by": user["email"],
                    }},
                )
    credit_total = round(total_paid + offer_amount, 2)
    inc = {"balance": -credit_total}
    if body.points_used:
        inc["points"] = -int(body.points_used)
    await db.clients.update_one({"id": body.client_id}, {"$inc": inc})
    if body.points_used:
        await _log_points(body.client_id, -int(body.points_used), "payment", pid, f"Pagamento (descontou {points_euros:.2f} €)", user["email"])
    # Ficha temporária liquidada a 0,00 € → arquivada e vaga libertada
    await _sync_temp_client_state(body.client_id, user["email"])
    if offer_amount > 0:
        entries = [
            {"sale_id": t.sale_id, "product_name": t.product_name, "unit_price": float(t.unit_price), "qty": int(t.qty_offer), "amount": round(float(t.unit_price) * t.qty_offer, 2), "client_id": body.client_id, "source": "payment"}
            for t in body.item_targets if t.qty_offer > 0
        ]
        await _record_house_offers(entries, user, c["name"], c.get("member_number"))
    if tip > 0:
        await _audit("payment_tip", user["email"], entity="payment", entity_id=pid, after={"tip": tip, "client": c["name"]}, summary=f"Gratificação {tip:.2f} € de {c['name']}")
    await _audit("payment_create", user["email"], entity="payment", entity_id=pid, tx_number=tx_no, summary=f"Pagamento #{tx_no} · {c['name']} · entregue {float(body.amount):.2f} € · abatido {credit_total:.2f} €" + (f" · troco {change_returned:.2f} €" if change_returned else "") + (f" · oferta {offer_amount:.2f} €" if offer_amount else "") + (f" · vendas {sale_tx_numbers}" if sale_tx_numbers else ""))
    await _sync_quota_paid_status(body.client_id)
    pay.pop("_id", None)
    return pay


@api_router.get("/house-offers/allowance")
async def get_house_offer_allowance(user: dict = Depends(get_current_user)):
    """Quanto cada funcionário ainda pode oferecer este mês (funcionário 20 €, admin/tesoureiro 50 €)."""
    return await _house_offer_allowance(user)


@api_router.get("/house-offers")
async def list_house_offers(year: Optional[int] = None, month: Optional[int] = None, user: dict = Depends(get_current_user)):
    """Consulta de ofertas da casa por funcionário (quem ofereceu mais) e entradas detalhadas."""
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    prefix = f"{year}-{month:02d}"
    offers_q: dict = {"created_at": {"$regex": f"^{prefix}"}}
    # Funcionário consulta apenas as SUAS ofertas da casa
    if user.get("role") == "funcionario":
        offers_q["user_email"] = user["email"]
    items = await db.house_offers.find(offers_q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    by_user = {}
    for it in items:
        u = by_user.setdefault(it["user_email"], {"user_email": it["user_email"], "role": it.get("user_role") or "—", "total": 0.0, "count": 0})
        u["total"] += float(it.get("amount") or 0)
        u["count"] += 1
    ranked = sorted(by_user.values(), key=lambda x: (-x["total"], x["user_email"]))
    for u in ranked:
        u["total"] = round(u["total"], 2)
        u["limit"] = HOUSE_OFFER_LIMITS.get(u.get("role"), HOUSE_OFFER_DEFAULT_LIMIT)
    return {
        "year": year,
        "month": month,
        "items": items,
        "by_user": ranked,
        "total": round(sum(float(i.get("amount") or 0) for i in items), 2),
    }


@api_router.post("/payments/{payment_id}/reverse")
async def reverse_payment(payment_id: str, user: dict = Depends(get_current_user)):
    """Estorna um pagamento. Permissões:
    - Admin/Tesoureiro: sempre.
    - Quem fez o lançamento: até 5 minutos depois de criado.
    """
    pay = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    if not pay:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    role = user.get("role")
    is_priv = role in ("admin", "tesoureiro")
    if not is_priv:
        if pay.get("user_email") != user.get("email"):
            raise HTTPException(status_code=403, detail="Só podes estornar pagamentos que tu lançaste")
        # janela de 5 min
        try:
            created = datetime.fromisoformat(pay["created_at"].replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Data inválida no pagamento")
        delta = datetime.now(timezone.utc) - created
        if delta.total_seconds() > 5 * 60:
            raise HTTPException(status_code=403, detail="Prazo expirado (5 min). Pede ao admin/tesoureiro.")
    total_credited = float(pay.get("total_credited", pay.get("amount", 0)))
    points_used = int(pay.get("points_used", 0))
    inc = {"balance": total_credited}
    if points_used:
        inc["points"] = points_used
    await db.clients.update_one({"id": pay["client_id"]}, {"$inc": inc})
    if points_used:
        await _log_points(pay["client_id"], points_used, "payment_reverse", payment_id, "Estorno de pagamento", user["email"])
    await _sync_temp_client_state(pay["client_id"], user["email"])
    await db.payments.delete_one({"id": payment_id})
    await _audit("payment_reverse", user["email"], entity="payment", entity_id=payment_id, before=pay, summary=f"Estorno de pagamento (#{pay.get('tx_number', '—')}) · cliente {pay.get('client_name', '—')}")
    await _sync_quota_paid_status(pay["client_id"])
    return {"ok": True, "restored_balance": total_credited, "restored_points": points_used}

@api_router.put("/payments/{payment_id}")
async def update_payment(payment_id: str, body: PaymentUpdate, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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
    await _audit("payment_edit", user["email"], entity="payment", entity_id=payment_id, summary=f"Pagamento editado · {pay.get('client_name', '—')}")
    await _sync_quota_paid_status(pay["client_id"])
    return await db.payments.find_one({"id": payment_id}, {"_id": 0})

@api_router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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
    await _sync_temp_client_state(pay["client_id"], user["email"])
    await db.payments.delete_one({"id": payment_id})
    await _audit("payment_delete", user["email"], entity="payment", entity_id=payment_id, before=pay, summary=f"Pagamento eliminado (#{pay.get('tx_number', '—')}) · {pay.get('client_name', '—')} · dívida reposta")
    await _sync_quota_paid_status(pay["client_id"])
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
    clients_total = await db.clients.count_documents({"archived": {"$ne": True}})
    # Cotas não contam para valor de stock nem para alertas de stock baixo
    stockable_products = [p for p in products if not p.get("is_quota")]
    total_stock_value = sum(p.get("price", 0) * p.get("quantity", 0) for p in stockable_products)
    # Valor de stock ao preço de custo (só direção/tesouraria vê este cartão)
    total_stock_cost = sum(
        float(p.get("cost_price") if p.get("cost_price") is not None else round(float(p.get("price", 0) or 0) * 0.88, 2))
        * p.get("quantity", 0)
        for p in stockable_products
    )
    stock_margin_pct = (
        round((total_stock_value - total_stock_cost) / total_stock_value * 100, 1)
        if total_stock_value > 0 else 0.0
    )
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
    clients = await db.clients.find({"archived": {"$ne": True}}, {"_id": 0, "pin_hash": 0}).to_list(2000)
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

    # Resumo financeiro do mês corrente (Receitas vs Despesas = Saldo) — só gestão
    fin_month = None
    if user.get("role") in ("admin", "tesoureiro", "presidente"):
        f_data = await _finance_summary(
            datetime.now(timezone.utc).strftime("%Y-%m-01"),
            datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        )
        fin_month = {
            "income": f_data["income"]["total"],
            "expenses": f_data["expenses"]["total"],
            "balance": f_data["balance"],
            "counts": f_data["counts"],
        }
        # Saldos contabilísticos (caixa + banco) — incluem despesas pagas
        cash_bank = await _account_balances()
    else:
        # Funcionários veem apenas o valor em caixa (o banco fica reservado à direção/tesouraria)
        _balances = await _account_balances()
        cash_bank = {"cash_balance": _balances["cash_balance"], "bank_balance": None, "total_balance": None}
    # Dívidas antigas (sem pagamento há mais de X dias) — alerta automático
    overdue = await _overdue_debtors(clients, OVERDUE_DEBT_DAYS)
    # Aniversários dos próximos 7 dias
    birthdays = _upcoming_birthdays(clients, 7)

    walkin = [c for c in clients if c.get("is_walkin")]
    return {
        "products_count": len(products),
        "clients_count": clients_total,
        "walkin_count": len(walkin),
        "walkin_balance": round(sum(max(float(c.get("balance", 0) or 0), 0) for c in walkin), 2),
        "total_stock_value": total_stock_value,
        "total_stock_cost": round(total_stock_cost, 2),
        "stock_margin_pct": stock_margin_pct,
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
        "finance_month": fin_month,
        "cash_bank": locals().get("cash_bank"),
        "overdue_debts": {"days": OVERDUE_DEBT_DAYS, "count": len(overdue), "clients": overdue},
        "birthdays": birthdays,
    }

# ---------- Dívidas atrasadas / alertas ----------
OVERDUE_DEBT_DAYS = 30  # notificar após X dias sem pagamento

async def _overdue_debtors(clients: list, days: int) -> list:
    """Clientes com saldo em dívida e sem pagamento há mais de `days` dias."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    out = []
    for c in clients:
        bal = float(c.get("balance", 0) or 0)
        if bal <= 0:
            continue
        first_sale = await db.sales.find_one({"client_id": c["id"]}, sort=[("created_at", 1)], projection={"created_at": 1})
        if not first_sale:
            continue
        last_pay = await db.payments.find_one({"client_id": c["id"]}, sort=[("created_at", -1)], projection={"created_at": 1})
        ref = last_pay["created_at"] if last_pay else first_sale["created_at"]
        if ref < cutoff:
            out.append({
                "id": c["id"], "name": c["name"], "contact": c.get("contact"),
                "email": c.get("email"), "balance": bal,
                "unpaid_since": ref, "days": (datetime.now(timezone.utc) - datetime.fromisoformat(ref)).days,
            })
    out.sort(key=lambda x: x["days"], reverse=True)
    return out

def _upcoming_birthdays(clients: list, window_days: int) -> list:
    """Sócios com aniversário nos próximos `window_days` dias (ou hoje)."""
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    out = []
    for c in clients:
        b = c.get("birthday")
        if not b or not c.get("is_member"):
            continue
        try:
            bdate = datetime.strptime(b[:10], "%Y-%m-%d")
        except ValueError:
            continue
        this_year = now.replace(year=now.year, month=bdate.month, day=bdate.day)
        # 29/Fev → 28/Fev em anos não bissextos
        try:
            next_b = this_year if this_year >= now.replace(hour=0, minute=0, second=0, microsecond=0) else this_year.replace(year=now.year + 1)
        except ValueError:
            next_b = this_year.replace(day=28)
        if next_b < now.replace(hour=0, minute=0, second=0, microsecond=0):
            try:
                next_b = this_year.replace(year=now.year + 1)
            except ValueError:
                next_b = this_year.replace(year=now.year + 1, day=28)
        days_left = (next_b - now.replace(hour=0, minute=0, second=0, microsecond=0)).days
        if 0 <= days_left <= window_days:
            out.append({
                "id": c["id"], "name": c["name"], "member_number": c.get("member_number"),
                "birthday": f"{bdate.day:02d}/{bdate.month:02d}", "days_left": days_left,
            })
    out.sort(key=lambda x: x["days_left"])
    return out

@api_router.get("/debts/overdue")
async def get_overdue_debts(days: int = OVERDUE_DEBT_DAYS, user: dict = Depends(get_current_user)):
    """Dívidas em atraso: sem pagamento há mais de `days` dias (para notificação)."""
    days = max(int(days), 1)
    clients = await db.clients.find({}, {"_id": 0, "pin_hash": 0}).to_list(5000)
    return await _overdue_debtors(clients, days)

@api_router.post("/debts/notify")
async def notify_overdue_debt(client_id: str, user: dict = Depends(get_current_user)):
    """Notifica por email um cliente com dívida em atraso (lembrete automático)."""
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    if not c.get("email"):
        raise HTTPException(status_code=400, detail="Cliente sem email registado")
    bal = max(float(c.get("balance", 0) or 0), 0)
    sent = await send_email(
        c["email"],
        f"{CLUB_NAME} · lembrete de conta em aberto",
        f"<p>Olá {c['name']},</p><p>Informamos que a sua conta tem um saldo em aberto de "
        f"<strong>{bal:.2f} €</strong>.</p><p>Passe pelo bar para regularizar. Obrigado!<br/>{CLUB_NAME}</p>",
    )
    await _audit("debt_notify", user["email"], entity="client", entity_id=client_id,
                 summary=f"Lembrete de dívida ({bal:.2f} €) enviado para {c['email']}")
    return {"ok": True, "sent": sent,
            "note": "Email enviado." if sent else "Resend não configurado — adiciona RESEND_API_KEY para ativar."}

# ---------- Admin Directory ----------
@api_router.get("/admin/clients")
async def admin_clients_directory(user: dict = Depends(require_role("admin"))):
    # Sócios directory: only registered members
    socios = await db.clients.find({"is_member": True}, {"_id": 0, "pin_hash": 0}).sort("name", 1).to_list(5000)
    # Enriquecer com resumo de cotas do ano corrente (X/12 pagas)
    year = datetime.now(timezone.utc).year
    socio_ids = [s["id"] for s in socios]
    quotas = await db.quotas.find(
        {"client_id": {"$in": socio_ids}, "year": year, "status": "paid"},
        {"_id": 0, "client_id": 1, "month": 1},
    ).to_list(50000)
    paid_count = {}
    for q in quotas:
        paid_count[q["client_id"]] = paid_count.get(q["client_id"], 0) + 1
    for s in socios:
        s["quotas_paid"] = paid_count.get(s["id"], 0)
        s["quotas_total"] = 12
        s["quotas_year"] = year
        s["quotas_up_to_date"] = paid_count.get(s["id"], 0) >= 12
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
MONTHS_FULL_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


def _quota_amount(client: Optional[dict], doc: Optional[dict] = None) -> float:
    """Valor de uma cota: o registado no mês ou o valor definido pelo sócio/clube."""
    if doc and doc.get("amount") is not None:
        return round(float(doc["amount"]), 2)
    if client:
        if client.get("is_honorary") and client.get("honorary_annual_value"):
            return round(float(client["honorary_annual_value"]) / 12, 2)
        if client.get("quota_monthly_value") is not None:
            return round(float(client["quota_monthly_value"]), 2)
    return QUOTA_MONTHLY_VALUE


async def _quotas_status(client_id: str, year: int) -> list:
    """Retorna 12 entradas (uma por mês) com estado pago/em aberto para um sócio."""
    items = await db.quotas.find({"client_id": client_id, "year": year}, {"_id": 0}).to_list(20)
    client_doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "quota_monthly_value": 1, "is_honorary": 1, "honorary_annual_value": 1})
    paid_by_month = {it["month"]: it for it in items}
    out = []
    for m in range(1, 13):
        entry = paid_by_month.get(m)
        out.append({
            "year": year,
            "month": m,
            "label": f"{MONTHS_PT[m-1]}/{year}",
            "amount": _quota_amount(client_doc, entry),
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

def _quota_months_from_sale(sale: dict) -> tuple:
    """Extrai (year, [months]) de uma venda de cotas."""
    months = []
    year = None
    for it in sale.get("items", []):
        pid = it.get("product_id", "")
        if pid.startswith("quota-"):
            parts = pid.split("-")
            try:
                year = int(parts[1])
                months.append(int(parts[2]))
            except (ValueError, IndexError):
                continue
    return year, months

async def _sync_quota_paid_status(client_id: str):
    """Recalcula o estado das cotas a partir da cobertura de pagamentos (FIFO + sale_ids).
    Vendas de cota cobertas por pagamentos → meses 'paid'; caso contrário → 'billed'.
    Meses com flag 'reversed' (extorno manual) não são tocados."""
    sales = await db.sales.find({"client_id": client_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    if not sales:
        return
    payments = await db.payments.find({"client_id": client_id}, {"_id": 0}).sort("created_at", 1).to_list(5000)
    targeted = set()
    pool = 0.0
    for p in payments:
        if p.get("sale_ids"):
            targeted.update(p["sale_ids"])
        else:
            pool += float(p.get("total_credited", 0) or 0)
    covered = set()
    for s in sales:
        if s["id"] in targeted:
            covered.add(s["id"])
            continue
        tot = float(s.get("total", 0))
        if pool >= tot - 1e-9:
            covered.add(s["id"])
            pool -= tot
        elif pool > 1e-9:
            pool = 0.0
    existing = await db.quotas.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    reversed_keys = {(q["year"], q["month"]) for q in existing if q.get("reversed")}
    client_doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "quota_monthly_value": 1, "is_honorary": 1, "honorary_annual_value": 1})
    for s in sales:
        year, months = _quota_months_from_sale(s)
        if not year or not months:
            continue
        status = "paid" if s["id"] in covered else "billed"
        sale_prices = {
            it.get("product_id"): float(it.get("unit_price") or 0)
            for it in (s.get("items") or [])
        }
        for m in months:
            if (year, m) in reversed_keys:
                continue
            patch = {
                "client_id": client_id, "year": year, "month": m,
                "status": status,
                "amount": round(sale_prices.get(f"quota-{year}-{m:02d}") or _quota_amount(client_doc), 2),
                "sale_id": s["id"],
            }
            if status == "paid":
                patch["paid_at"] = s.get("created_at")
                patch["billed_at"] = None
            else:
                patch["billed_at"] = s.get("created_at")
                patch["paid_at"] = None
            await db.quotas.update_one(
                {"client_id": client_id, "year": year, "month": m},
                {"$set": patch},
                upsert=True,
            )

def _quota_status_from_docs(client: Optional[dict], docs: list) -> dict:
    """Classifica as cotas de um sócio (regras da direção):
    🟢 paid   → todos os meses vencidos do ano corrente pagos e nenhum mês de anos anteriores em falta;
    🟡 pending → há meses vencidos por pagar no ano corrente (sem dívida de anos anteriores);
    🔴 debt   → existe pelo menos um mês de anos anteriores por pagar, ou nenhum mês do ano corrente pago."""
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    prev_year, prev_month = (year, month - 1) if month > 1 else (year - 1, 12)
    by: dict = {}
    for q in docs or []:
        if q.get("reversed"):
            continue
        try:
            by[(int(q["year"]), int(q["month"]))] = q
        except (KeyError, TypeError, ValueError):
            continue
    # Meses de anos anteriores por pagar (dívida antiga) — todos contam, independentemente do mês atual
    debt_months = []
    for (y, m), q in sorted(by.items()):
        if y < year and q.get("status") != "paid":
            debt_months.append((y, m, q))
    # Meses vencidos do ano corrente (até ao mês anterior). O mês atual ainda não conta como atraso.
    current_due = []
    for m in range(1, month):
        q = by.get((year, m))
        if not q or q.get("status") != "paid":
            current_due.append((year, m, q))
    paid_current = sum(1 for (y, _m), q in by.items() if y == year and q.get("status") == "paid")
    unpaid_months = []
    for y, m, q in sorted(debt_months + current_due):
        unpaid_months.append({
            "year": y,
            "month": m,
            "label": f"{MONTHS_FULL_PT[m-1]} {y}",
            "amount": _quota_amount(client, q),
        })
    amount_due = round(sum(u["amount"] for u in unpaid_months), 2)
    # Partes do descritivo: "2 cotas de 2025 + Setembro 2026"
    parts = []
    prev_groups: dict = {}
    for y, m, _q in debt_months:
        prev_groups.setdefault(y, []).append(m)
    for y in sorted(prev_groups):
        n = len(prev_groups[y])
        parts.append(f"{n} cota{'s' if n != 1 else ''} de {y}")
    if current_due:
        parts.extend(f"{MONTHS_FULL_PT[m-1]} {year}" for _y, m, _q in current_due)
    if debt_months or (paid_current == 0 and month > 1):
        detail = "Em dívida: " + (" + ".join(parts) if parts else f"{month - 1} cota(s) de {year}")
        return {
            "status": "debt", "label": "Em dívida", "detail": detail,
            "amount_due": amount_due, "months_due": len(unpaid_months),
            "unpaid_months": unpaid_months, "paid_current_year": paid_current,
        }
    if not current_due:
        return {
            "status": "paid", "label": "Cotas em dia",
            "detail": f"Cotas em dia · {MONTHS_FULL_PT[prev_month-1]} {prev_year} pago",
            "amount_due": 0.0, "months_due": 0, "unpaid_months": [], "paid_current_year": paid_current,
        }
    detail = "Por regularizar: " + " + ".join(parts)
    return {
        "status": "pending", "label": "Por regularizar", "detail": detail,
        "amount_due": amount_due, "months_due": len(unpaid_months),
        "unpaid_months": unpaid_months, "paid_current_year": paid_current,
    }


async def _quota_overall_status(client_id: str) -> Optional[dict]:
    """Estado global das cotas de um sócio (ver `_quota_status_from_docs`)."""
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not c or not c.get("is_member"):
        return None
    docs = await db.quotas.find({"client_id": client_id}, {"_id": 0}).to_list(400)
    return _quota_status_from_docs(c, docs)

@api_router.post("/quotas/pay")
async def pay_quotas(body: QuotaPayIn, user: dict = Depends(get_current_user)):
    """Gera a cobrança de cotas: lança venda na CONTA CORRENTE (com nº de transação),
    fica 'billed' — o sócio paga depois ao balcão ou por MBWay."""
    if not body.months:
        raise HTTPException(status_code=400, detail="Sem meses selecionados")
    c = await db.clients.find_one({"id": body.client_id})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    already = await db.quotas.find({"client_id": body.client_id, "year": body.year, "month": {"$in": body.months}, "status": {"$in": ["paid", "billed"]}, "reversed": {"$ne": True}}, {"_id": 0}).to_list(20)
    if already:
        raise HTTPException(status_code=400, detail=f"Já lançadas na conta corrente: {', '.join(MONTHS_PT[a['month']-1] for a in already)}")
    unit = _quota_amount(c)
    total = round(unit * len(body.months), 2)
    sale_id = str(uuid.uuid4())
    tx_no = await _next_tx_number()
    items = [{
        "product_id": f"quota-{body.year}-{m:02d}",
        "product_name": f"Cota {MONTHS_PT[m-1]}/{body.year}",
        "unit_price": unit,
        "quantity": 1,
        "subtotal": unit,
    } for m in body.months]
    sale = {
        "id": sale_id,
        "tx_number": tx_no,
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
    # conta corrente: dívida + consumo registrado
    await db.clients.update_one({"id": body.client_id}, {"$inc": {"balance": total, "total_spent": total}})
    for m in body.months:
        await db.quotas.update_one(
            {"client_id": body.client_id, "year": body.year, "month": m},
            {"$set": {
                "client_id": body.client_id, "year": body.year, "month": m,
                "status": "billed",
                "amount": unit,
                "billed_at": datetime.now(timezone.utc).isoformat(),
                "sale_id": sale_id,
                "user_email": user["email"],
            }, "$unset": {"reversed": ""}},
            upsert=True,
        )
    await _audit("quota_bill", user["email"], entity="client", entity_id=body.client_id, summary=f"Cotas {body.year} ({', '.join(MONTHS_PT[m-1] for m in body.months)}) lançadas na conta corrente · {total:.2f} € · tx #{tx_no}")
    sale.pop("_id", None)
    return {"sale": sale}

class QuotaBulkLaunchIn(BaseModel):
    year: int
    months: List[int]
    note: str = ""

@api_router.post("/quotas/bulk-launch")
async def bulk_launch_quotas(body: QuotaBulkLaunchIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    """Direção (mandato): lança as cotas de TODOS os sócios na CONTA CORRENTE
    (venda com nº de transação) e regista de imediato o pagamento —
    as cotas ficam 'paid', o saldo da conta corrente volta a zero."""
    if not body.months:
        raise HTTPException(status_code=400, detail="Sem meses selecionados")
    members = await db.clients.find({"is_member": True}, {"_id": 0}).to_list(5000)
    launched = []
    skipped = []
    total_amount = 0.0
    for c in sorted(members, key=lambda x: (x.get("member_number") or "999999")):
        taken = await db.quotas.find(
            {"client_id": c["id"], "year": body.year, "month": {"$in": body.months},
             "status": {"$in": ["paid", "billed"]}, "reversed": {"$ne": True}},
            {"_id": 0, "month": 1},
        ).to_list(20)
        months = [m for m in body.months if m not in {t["month"] for t in taken}]
        if not months:
            skipped.append(c["name"])
            continue
        total = round(QUOTA_MONTHLY_VALUE * len(months), 2)
        sale_id = str(uuid.uuid4())
        tx_no = await _next_tx_number()
        items = [{
            "product_id": f"quota-{body.year}-{m:02d}",
            "product_name": f"Cota {MONTHS_PT[m-1]}/{body.year}",
            "unit_price": QUOTA_MONTHLY_VALUE,
            "quantity": 1,
            "subtotal": QUOTA_MONTHLY_VALUE,
        } for m in months]
        sale = {
            "id": sale_id,
            "tx_number": tx_no,
            "client_id": c["id"],
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
        # pagamento imediato da venda de cotas (contas liquidadas)
        pay_tx = await _next_tx_number()
        pay = {
            "id": str(uuid.uuid4()),
            "tx_number": pay_tx,
            "client_id": c["id"],
            "client_name": c["name"],
            "amount": total,
            "tendered": total,
            "points_used": 0,
            "points_value": 0.0,
            "total_credited": total,
            "change_returned": 0.0,
            "keep_change_as_credit": False,
            "tip": 0.0,
            "sale_ids": [sale_id],
            "sale_tx_numbers": [tx_no],
            "item_targets": None,
            "offer_amount": 0.0,
            "note": body.note or f"Lançamento de cotas {body.year} pago pela direção",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "user_email": user["email"],
            "source": "cash",
        }
        await db.payments.insert_one(pay)
        await db.clients.update_one({"id": c["id"]}, {"$inc": {"balance": -total, "total_spent": total}})
        await _sync_quota_paid_status(c["id"])
        total_amount += total
        launched.append({
            "client_id": c["id"], "client": c["name"], "member_number": c.get("member_number"),
            "months": months, "amount": total, "tx_number": tx_no,
        })
    if launched:
        await _audit(
            "quota_bulk_launch", user["email"], entity="quota",
            summary=f"Direção {body.year}: cotas {', '.join(MONTHS_PT[m-1] for m in body.months)} lançadas e pagas a {len(launched)} sócios · {total_amount:.2f} €",
        )
    return {"year": body.year, "months": body.months, "launched": launched, "skipped": skipped, "total": round(total_amount, 2)}

class QuotaReverseIn(BaseModel):
    client_id: str
    year: int
    months: List[int]

@api_router.post("/quotas/reverse")
async def reverse_quotas(body: QuotaReverseIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    """Extorna cotas PAGAS (devolve o valor em CONTA CORRENTE) e DESLANÇA cotas lançadas na conta
    (remove a venda de cota e a cobrança da conta corrente)."""
    if not body.months:
        raise HTTPException(status_code=400, detail="Sem meses selecionados")
    c = await db.clients.find_one({"id": body.client_id})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    credited = 0.0
    unbilled = 0.0
    reversed_months = []
    unbilled_months = []
    for m in body.months:
        q = await db.quotas.find_one({"client_id": body.client_id, "year": body.year, "month": m})
        if not q or q.get("reversed"):
            continue
        amount = float(q.get("amount", QUOTA_MONTHLY_VALUE))
        if q.get("status") == "paid":
            await db.quotas.update_one(
                {"client_id": body.client_id, "year": body.year, "month": m},
                {"$set": {"status": "open", "reversed": True, "reversed_at": datetime.now(timezone.utc).isoformat(), "reversed_by": user["email"]}},
            )
            credited += amount
            reversed_months.append(m)
        elif q.get("status") == "billed":
            # deslançar: remove o item da venda de cotas (ou a venda inteira) e abate da conta corrente
            sale_id = q.get("sale_id")
            if sale_id:
                sale = await db.sales.find_one({"id": sale_id})
                if sale:
                    remaining = [it for it in sale.get("items", []) if it.get("product_id") != f"quota-{body.year}-{m:02d}"]
                    removed = sum(float(it.get("subtotal", 0)) for it in sale.get("items", []) if it.get("product_id") == f"quota-{body.year}-{m:02d}")
                    if remaining:
                        await db.sales.update_one({"id": sale_id}, {"$set": {"items": remaining, "total": round(sum(float(it.get("subtotal", 0)) for it in remaining), 2)}})
                    else:
                        await db.sales.delete_one({"id": sale_id})
                    unbilled += removed if removed else amount
                else:
                    unbilled += amount
            else:
                unbilled += amount
            await db.quotas.update_one(
                {"client_id": body.client_id, "year": body.year, "month": m},
                {"$set": {"status": "open", "reversed": True, "reversed_at": datetime.now(timezone.utc).isoformat(), "reversed_by": user["email"]}, "$unset": {"sale_id": ""}},
            )
            unbilled_months.append(m)
    if not reversed_months and not unbilled_months:
        raise HTTPException(status_code=400, detail="Nenhum dos meses está pago ou lançado na conta (extorno aplica-se a cotas pagas/lançadas)")
    # crédito ao sócio em conta corrente (cotas pagas) · abate da cobrança (cotas lançadas)
    await db.clients.update_one({"id": body.client_id}, {"$inc": {"balance": -(credited + unbilled), "total_spent": -(credited + unbilled)}})
    bits = []
    if reversed_months:
        bits.append(f"extorno pago de {credited:.2f} € ({', '.join(MONTHS_PT[m-1] for m in reversed_months)})")
    if unbilled_months:
        bits.append(f"deslançadas da conta corrente {unbilled:.2f} € ({', '.join(MONTHS_PT[m-1] for m in unbilled_months)})")
    await _audit("quota_reverse", user["email"], entity="client", entity_id=body.client_id,
                 summary=f"Cotas {body.year}: " + " · ".join(bits))
    return {"ok": True, "credited": credited, "unbilled": unbilled, "months": reversed_months + unbilled_months}

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


class SocioPinRecoveryIn(BaseModel):
    member_number: str


@api_router.post("/socio/pin-recovery-request")
async def socio_pin_recovery_request(body: SocioPinRecoveryIn):
    """Recuperação de PIN: o sócio indica o nº de sócio e fica registado um
    pedido para a direção/tesouraria (entrega do novo PIN na receção)."""
    mn = (body.member_number or "").strip()
    if not mn:
        raise HTTPException(status_code=400, detail="Indica o teu nº de sócio")
    c = await db.clients.find_one({"member_number": mn}, {"_id": 0})
    if c:
        await db.socio_messages.insert_one({
            "id": str(uuid.uuid4()),
            "client_id": c["id"],
            "client_name": c.get("name") or mn,
            "subject": "🔑 Pedido de recuperação de PIN",
            "message": f"O sócio {c.get('name') or mn} (nº {mn}) pediu a recuperação do PIN de acesso ao portal. Atribuir/entregar novo PIN.",
            "from_staff": False,
            "status": "open",  # open | replied | archived
            "reply": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await _audit("pin_recovery_request", mn, entity="client", entity_id=c["id"],
                     summary=f"Sócio nº {mn} pediu recuperação de PIN")
    # Resposta genérica — não revela se o nº existe
    return {"ok": True, "message": "Pedido enviado. A direção vai tratar do teu PIN — passa na receção do clube."}

async def _maybe_award_birthday(client_id: str):
    """No dia de aniversário: pontos = idade ÷ 4 + mensagem de parabéns com os pontos oferecidos."""
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not c or not c.get("birthday"):
        return
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    try:
        bd = datetime.fromisoformat(str(c["birthday"]))
    except (ValueError, TypeError):
        return
    if (bd.month, bd.day) != (now.month, now.day):
        return
    if c.get("birthday_points_year") == now.year:
        return
    age = max(now.year - bd.year, 1)
    pts = max(age // 4, 1)
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"birthday_points_year": now.year}, "$inc": {"points": pts}},
    )
    await _log_points(client_id, pts, "birthday", None, f"Bónus de aniversário · {age} anos ÷ 4 = {pts} pontos", "sistema")
    text = f"🎂 Parabéns, {c['name']}! A ARD Nespereira deseja-te um feliz aniversário e oferece-te {pts} pontos ({age} ÷ 4)."
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "client_name": c["name"],
        "subject": "🎂 Feliz aniversário!",
        "message": text,
        "from_staff": True,
        "reply": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    if c.get("email"):
        await send_email(c["email"], "🎂 Feliz aniversário — ARD Nespereira", f"<p>{text}</p>")
    await _audit("birthday_bonus", "sistema", entity="client", entity_id=client_id, summary=f"Bónus de aniversário: +{pts} pts ({age} anos ÷ 4) · mensagem enviada ao sócio")


@api_router.get("/socio/me")
async def socio_me(socio: dict = Depends(get_current_socio)):
    await _maybe_award_birthday(socio["id"])
    fresh = await db.clients.find_one({"id": socio["id"]}, {"_id": 0, "pin_hash": 0})
    if fresh:
        socio = await _maybe_end_tutela(fresh)
    sales = await db.sales.find({"client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    payments = await db.payments.find({"client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    mbway = await db.mbway_payments.find({"client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    family = None
    if _is_minor_client(socio):
        head = None
        if socio.get("family_head_client_id"):
            h = await db.clients.find_one({"id": socio["family_head_client_id"]}, {"_id": 0, "name": 1, "member_number": 1})
            if h:
                head = {"name": h.get("name"), "member_number": h.get("member_number")}
        family = {
            "head": head,
            "restriction": MINOR_RESTRICTION_TEXT,
            "consumption_limit": socio.get("consumption_limit"),
            "used_this_month": await _monthly_consumption(socio["id"]),
        }
    # Histórico de acessos à área de sócio (última visita + lista para o próprio e para a administração)
    access_history = await db.socio_accesses.find(
        {"client_id": socio["id"]}, {"_id": 0}
    ).sort("at", -1).to_list(100)
    access_at = datetime.now(timezone.utc).isoformat()
    previous_access = (fresh or {}).get("socio_last_access")
    await db.socio_accesses.insert_one({
        "id": str(uuid.uuid4()), "client_id": socio["id"], "at": access_at,
    })
    await db.clients.update_one(
        {"id": socio["id"]},
        {"$set": {"socio_last_access": access_at}, "$inc": {"socio_access_count": 1}},
    )
    socio["socio_last_access"] = access_at
    # Estado real das cotas (🟢/🟡/🔴) — saudação, bola e acesso aos rankings dependem dele
    socio["quota_status"] = await _quota_overall_status(socio["id"])
    return {
        "client": socio, "sales": sales, "payments": payments, "mbway": mbway, "family": family,
        "last_access": previous_access, "access_history": access_history,
    }

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
    points_to_use = 0
    if body.use_points:
        if body.points_to_use <= 0:
            raise HTTPException(status_code=400, detail="Quantidade de pontos inválida")
        if body.points_to_use % POINTS_PER_EURO != 0:
            raise HTTPException(status_code=400, detail=f"Os pontos devem ser múltiplos de {POINTS_PER_EURO} (5 pts = 1 €)")
        cur = await db.clients.find_one({"id": socio["id"]}, {"points": 1, "balance": 1})
        available = int(cur.get("points", 0)) if cur else 0
        if body.points_to_use > available:
            raise HTTPException(status_code=400, detail=f"Só tens {available} pontos disponíveis")
        points_to_use = int(body.points_to_use)
    rec = {
        "id": str(uuid.uuid4()),
        "client_id": socio["id"],
        "client_name": socio["name"],
        "amount": float(body.amount),
        "mbway_phone": body.mbway_phone.strip(),
        "note": body.note,
        "points_used": points_to_use,
        "status": "pending",  # pending | confirmed | rejected
        "created_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_at": None,
        "confirmed_by": None,
    }
    await db.mbway_payments.insert_one(rec)
    rec.pop("_id", None)
    return rec

def _allocate_payment_coverages(sales: list, payments: list) -> dict:
    """Imputa cada pagamento às vendas em dívida (FIFO) e devolve o detalhe por pagamento.
    Usado nos recibos antigos, que não guardavam os itens pagos (item_targets)."""
    remaining = {s["id"]: round(float(s.get("total", 0) or 0), 2) for s in sales}
    ordered_sales = sorted(sales, key=lambda x: x.get("created_at") or "")
    out: dict = {}
    for p in sorted(payments, key=lambda x: x.get("created_at") or ""):
        covered = []
        if p.get("item_targets"):
            for t in p["item_targets"]:
                amt = round(float(t.get("unit_price", 0) or 0) * (
                    int(t.get("qty_pay", 0) or 0) + int(t.get("qty_offer", 0) or 0)
                ), 2)
                sid = t.get("sale_id")
                remaining[sid] = round(max(remaining.get(sid, 0) - amt, 0), 2)
            out[p["id"]] = covered
            continue
        pool = round(float(p.get("total_credited") or p.get("amount") or 0), 2)
        target_ids = set(p.get("sale_ids") or [])
        candidates = [s for s in ordered_sales if not target_ids or s["id"] in target_ids]
        if target_ids:
            candidates += [s for s in ordered_sales if s["id"] not in target_ids]
        for s in candidates:
            if pool <= 0:
                break
            rem = remaining.get(s["id"], 0)
            if rem <= 0.004:
                continue
            take = round(min(pool, rem), 2)
            remaining[s["id"]] = round(rem - take, 2)
            pool = round(pool - take, 2)
            covered.append({
                "sale_id": s["id"],
                "tx_number": s.get("tx_number"),
                "created_at": s.get("created_at"),
                "total": float(s.get("total", 0) or 0),
                "applied": take,
                "items": s.get("items") or [],
            })
        out[p["id"]] = covered
    return out


@api_router.get("/transactions/{tx_number}")
async def get_transaction(tx_number: int, user: dict = Depends(get_current_user)):
    """Procura uma transação por nº em todas as collections (venda, pagamento, encomenda,
    despesa, depósito/levantamento de caixa e fecho de caixa)."""
    for coll, kind in [
        ("sales", "sale"), ("payments", "payment"), ("supplier_orders", "order"),
        ("supplier_expenses", "expense"), ("cash_withdrawals", "cash_withdrawal"),
        ("cash_closes", "cash_close"),
    ]:
        doc = await db[coll].find_one({"tx_number": int(tx_number)}, {"_id": 0})
        if doc:
            doc["_kind"] = kind
            if kind == "cash_withdrawal" and doc.get("kind") == "credit_refund":
                # Devolução de crédito: junta o recibo/nota de crédito que deu origem à saída de caixa
                doc["linked_payment"] = await db.payments.find_one(
                    {"client_id": doc.get("client_id"), "source": "refund", "created_at": doc.get("created_at")},
                    {"_id": 0},
                )
            if kind == "sale":
                # Histórico completo de edições (antes / depois) desta transação
                doc["edits"] = await db.audit_log.find(
                    {"type": "sale_edit", "sale_id": doc["id"]}, {"_id": 0}
                ).sort("at", 1).to_list(200)
            if kind in ("sale", "payment"):
                cdoc = await db.clients.find_one({"id": doc.get("client_id")}, {"_id": 0, "pin_hash": 0})
                doc["client_is_temp"] = bool(cdoc and cdoc.get("is_temp"))
                if cdoc and cdoc.get("is_member"):
                    qs = await _quota_overall_status(cdoc["id"])
                    doc["client_quota_status"] = qs
                    doc["client_quota_debt"] = float((qs or {}).get("amount_due") or 0)
                    doc["client_is_honorary"] = bool(cdoc.get("is_honorary"))
            if kind == "payment":
                # Recibos antigos não guardavam os itens pagos: imputa o valor às vendas em dívida.
                sales = await db.sales.find(
                    {"client_id": doc["client_id"]}, {"_id": 0}
                ).sort("created_at", 1).to_list(2000)
                payments = await db.payments.find(
                    {"client_id": doc["client_id"]}, {"_id": 0}
                ).sort("created_at", 1).to_list(5000)
                coverage = _allocate_payment_coverages(sales, payments)
                doc["covered_docs"] = coverage.get(doc["id"], [])
            return doc
    raise HTTPException(status_code=404, detail="Transação não encontrada")

# ---------- Sócio profile-extra (foto + birthday + bónus 2 pts) ----------
class SocioProfileIn(BaseModel):
    birthday: Optional[str] = None
    photo_data: Optional[str] = None

@api_router.put("/socio/profile-extra")
async def socio_profile_extra(body: SocioProfileIn, socio: dict = Depends(get_current_socio)):
    """Sócio pode preencher foto + data de nascimento UMA ÚNICA VEZ (auto-serviço).
    Depois disso, só o admin pode alterar via PUT /api/clients/{id} ou /api/clients/{id}/photo."""
    current = await db.clients.find_one({"id": socio["id"]}, {"_id": 0})
    update = {}
    if body.birthday is not None:
        if current.get("birthday"):
            raise HTTPException(status_code=403, detail="Data de nascimento já definida. Pede ao administrador para alterar.")
        update["birthday"] = body.birthday
    if body.photo_data is not None:
        if current.get("photo_data"):
            raise HTTPException(status_code=403, detail="Foto já definida. Pede ao administrador para alterar.")
        if len(body.photo_data) > 1_500_000:
            raise HTTPException(status_code=400, detail="Imagem demasiado grande (máx ~1 MB)")
        update["photo_data"] = body.photo_data
    if not update:
        raise HTTPException(status_code=400, detail="Sem alterações")
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


# Admin/tesoureiro pode actualizar foto/data nascimento a qualquer momento
class AdminClientProfileIn(BaseModel):
    birthday: Optional[str] = None
    photo_data: Optional[str] = None
    clear_photo: bool = False

@api_router.put("/clients/{client_id}/profile-extra")
async def admin_client_profile_extra(client_id: str, body: AdminClientProfileIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    update = {}
    if body.birthday is not None:
        update["birthday"] = body.birthday or None
    if body.clear_photo:
        update["photo_data"] = None
    elif body.photo_data is not None:
        if len(body.photo_data) > 1_500_000:
            raise HTTPException(status_code=400, detail="Imagem demasiado grande (máx ~1 MB)")
        update["photo_data"] = body.photo_data
    if not update:
        raise HTTPException(status_code=400, detail="Sem alterações")
    await db.clients.update_one({"id": client_id}, {"$set": update})
    await _audit("client_profile_extra_edit", user["email"], entity="client", entity_id=client_id, before={k: c.get(k) for k in update}, after=update, summary=f"Perfil de {c['name']} actualizado")
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    return doc

# ---------- Staff broadcast para sócio ----------
class StaffToSocioMessageIn(BaseModel):
    client_id: str
    subject: str
    message: str

@api_router.post("/socio-messages/send-to-socio")
async def staff_send_to_socio(body: StaffToSocioMessageIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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
async def socio_list_products(exclude_request_id: Optional[str] = None, socio: dict = Depends(get_current_socio)):
    """Lista de produtos disponíveis para o sócio pedir consumo (exclui cotas e sem stock).
    A disponibilidade desconta o que já está reservado em pedidos pendentes.
    Ao editar um pedido, a reserva do próprio pedido é excluída (exclude_request_id)."""
    q = {"$and": [
        {"$or": [{"is_quota": {"$exists": False}}, {"is_quota": False}]},
        {"unavailable": {"$ne": True}},  # itens marcados como indisponíveis NUNCA aparecem na app
        {"quantity": {"$gt": 0}},
    ]}
    if not _food_window_open():
        q = {"$and": [q, {"$or": [{"is_food": {"$exists": False}}, {"is_food": False}]}]}
    items = await db.products.find(q, {"_id": 0, "cost_price": 0}).sort("name", 1).to_list(1000)
    # Reservado em pedidos ainda pendentes (qualquer sócio)
    reserved: dict = {}
    async for req in db.consumption_requests.find({"status": "pending"}, {"items": 1}):
        for it in req.get("items", []):
            pid = str(it.get("product_id", ""))
            if pid.startswith("quota-"):
                continue
            reserved[pid] = reserved.get(pid, 0) + int(it.get("quantity", 0))
    if _is_minor_client(socio):
        items = [p for p in items if _minor_product_allowed(p)]
    for p in items:
        p["available_quantity"] = max(int(p.get("quantity", 0)) - reserved.get(p["id"], 0), 0)
    return [p for p in items if p["available_quantity"] > 0]


async def _build_request_line_items(items, client_id: str, minor: bool = False) -> list:
    """Constrói line_items de um pedido de consumo; aceita pseudo-produto de cota ('quota-YYYY-MM')
    para o sócio pagar a cota em dívida junto ao pedido.
    Menores tutelados só podem pedir bebidas não alcoólicas, comida, snacks e gomas/doces."""
    pids = [it.product_id for it in items if not it.product_id.startswith("quota-")]
    prods = await db.products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(len(pids))
    pmap = {p["id"]: p for p in prods}
    client_doc = await db.clients.find_one(
        {"id": client_id}, {"_id": 0, "quota_monthly_value": 1, "is_honorary": 1, "honorary_annual_value": 1}
    )
    quota_unit = _quota_amount(client_doc)
    line_items = []
    total = 0.0
    for it in items:
        if it.product_id.startswith("quota-"):
            parts = it.product_id.split("-")
            try:
                qy, qm = int(parts[1]), int(parts[2])
            except (IndexError, ValueError):
                raise HTTPException(status_code=400, detail="Item de cota inválido")
            if qm < 1 or qm > 12 or qy < 2000 or qy > 2100:
                raise HTTPException(status_code=400, detail="Item de cota inválido")
            if it.quantity != 1:
                raise HTTPException(status_code=400, detail="Só podes incluir 1 cota por mês")
            existing = await db.quotas.find_one({"client_id": client_id, "year": qy, "month": qm})
            if existing and existing.get("status") == "paid" and not existing.get("reversed"):
                raise HTTPException(status_code=400, detail=f"Cota {MONTHS_PT[qm-1]}/{qy} já está paga")
            sub = quota_unit
            total += sub
            line_items.append({
                "product_id": it.product_id,
                "product_name": f"Cota {MONTHS_PT[qm-1]}/{qy}",
                "unit_price": quota_unit,
                "quantity": 1,
                "subtotal": sub,
                "is_quota": True,
            })
            continue
        prod = pmap.get(it.product_id)
        if not prod:
            raise HTTPException(status_code=404, detail=f"Produto {it.product_id} não encontrado")
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantidade inválida")
        if prod.get("unavailable"):
            raise HTTPException(status_code=400, detail=f"'{prod['name']}' está indisponível")
        if prod.get("is_food") and not _food_window_open():
            raise HTTPException(status_code=400, detail=f"'{prod['name']}' (comida) só pode ser pedida entre as 16h e as 20h")
        if minor and not _minor_product_allowed(prod):
            raise HTTPException(status_code=403, detail=f"'{prod['name']}' não é permitido a menores tutelados — {MINOR_RESTRICTION_TEXT}")
        sub = float(prod["price"]) * int(it.quantity)
        total += sub
        line_items.append({
            "product_id": prod["id"],
            "product_name": prod["name"],
            "unit_price": float(prod["price"]),
            "quantity": int(it.quantity),
            "subtotal": sub,
        })
    return line_items


# ---------- Menores tutelados (agregado familiar) ----------
# Um menor tutelado por um sócio titular só pode pedir: bebidas não alcoólicas,
# comida de cozinha ou snacks e gomas/doces. Bebidas alcoólicas (Cerveja, Vinho,
# Licor e a categoria genérica "Bebida"), merchandising e encomendas ficam de fora.
MINOR_ALLOWED_CATEGORIES = {
    "Água", "Refrigerante", "Energética", "Café", "Chá", "Sumo", "Sumos",
    "Snacks", "Comida", "Gomas", "Gomas/Doces", "Doces", "Gelados", "Lacticínios",
}

ALCOHOL_CATEGORIES = {"Cerveja", "Vinho", "Licor", "Licores", "Espirituosa", "Espirituosas", "Bebida", "Bebidas Alcoólicas", "Aguardente"}


def _is_minor_client(client: dict) -> bool:
    """Menor tutelado: ficha marcada is_minor ou ligada a um titular do agregado."""
    return bool(client.get("is_minor")) or bool(client.get("family_head_client_id"))


def _minor_product_allowed(prod: dict) -> bool:
    return (prod.get("category") or "Outros") in MINOR_ALLOWED_CATEGORIES


MINOR_RESTRICTION_TEXT = "Só podes pedir bebidas não alcoólicas, comida de cozinha, snacks e gomas/doces."


async def _monthly_consumption(client_id: str) -> float:
    """Consumo do mês corrente: vendas + pedidos de consumo ainda pendentes."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    used = 0.0
    async for s in db.sales.find({"client_id": client_id, "created_at": {"$gte": month_start}}, {"total": 1}):
        used += float(s.get("total", 0) or 0)
    async for r in db.consumption_requests.find({"client_id": client_id, "status": "pending", "created_at": {"$gte": month_start}}, {"total": 1}):
        used += float(r.get("total", 0) or 0)
    return round(used, 2)


async def _check_minor_limit(client_id: str, new_total: float):
    """Limite de consumo mensal do menor, definido pelo titular (consumption_limit)."""
    c = await db.clients.find_one({"id": client_id}, {"consumption_limit": 1, "family_head_client_id": 1, "name": 1})
    if not c or not c.get("family_head_client_id"):
        return
    limit = c.get("consumption_limit")
    if limit in (None, "", 0):
        return  # titular ainda não definiu limite
    used = await _monthly_consumption(client_id)
    projected = float(used) + float(new_total)
    if projected > float(limit) + 1e-9:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de consumo do mês excedido — o titular definiu {float(limit):.2f} €/mês (já usaste {used:.2f} €). Fala com o titular do agregado.",
        )


async def _check_credit_limit(client_id: str, new_total: float):
    """Teto de fiado: se saldo + novo pedido ultrapassa o limite de crédito do sócio, bloqueia."""
    c = await db.clients.find_one({"id": client_id}, {"credit_limit": 1, "balance": 1})
    if not c:
        return
    limit = c.get("credit_limit")
    if limit in (None, "", 0):
        return
    projected = float(c.get("balance", 0) or 0) + float(new_total)
    if projected > float(limit) + 1e-9:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de fiado excedido — teto de {float(limit):.2f} € (saldo atual {float(c.get('balance', 0) or 0):.2f} €). Regulariza a conta para voltar a pedir no bar.",
        )


# Sócio com 3 rejeições deixa de poder pedir pela app até a direção desbloquear na ficha
REJECTIONS_BLOCK_THRESHOLD = 3


async def _client_orders_blocked(client: dict) -> tuple[bool, int]:
    rejected = await db.consumption_requests.count_documents({"client_id": client["id"], "status": "rejected"})
    blocked = (rejected >= REJECTIONS_BLOCK_THRESHOLD) and not client.get("orders_unblocked")
    return blocked, rejected


@api_router.post("/socio/consumption-request")
async def socio_consumption_request(body: SocioConsumptionReqIn, socio: dict = Depends(get_current_socio)):
    blocked, rejected = await _client_orders_blocked(socio)
    if blocked:
        raise HTTPException(
            status_code=403,
            detail=f"Os pedidos pela app estão bloqueados ({rejected} rejeições). Fala com a direção para desbloquear na tua ficha.",
        )
    if not body.items:
        raise HTTPException(status_code=400, detail="Sem itens")
    pids = [it.product_id for it in body.items]
    prods = await db.products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(len(pids))
    minor = _is_minor_client(socio)
    line_items = await _build_request_line_items(body.items, socio["id"], minor=minor)
    total = round(sum(li["subtotal"] for li in line_items), 2)
    if minor:
        await _check_minor_limit(socio["id"], total)
    await _check_credit_limit(socio["id"], total)
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "client_id": socio["id"],
        "client_name": socio["name"],
        "items": line_items,
        "total": total,
        "note": body.note,
        "use_points_requested": bool(body.use_points),
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


@api_router.delete("/socio/consumption-requests/{req_id}")
async def socio_cancel_request(req_id: str, socio: dict = Depends(get_current_socio)):
    """Sócio pode cancelar o seu pedido enquanto estiver 'pending'."""
    req = await db.consumption_requests.find_one({"id": req_id, "client_id": socio["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Pedido já {req.get('status')}, não pode ser cancelado")
    await db.consumption_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "cancelled", "decided_at": datetime.now(timezone.utc).isoformat(), "decided_by": socio.get("email") or "socio-self"}},
    )
    return {"ok": True}


@api_router.put("/socio/consumption-requests/{req_id}")
async def socio_edit_request(req_id: str, body: SocioConsumptionReqIn, socio: dict = Depends(get_current_socio)):
    """Sócio pode editar itens / nota enquanto o pedido ainda estiver pendente."""
    req = await db.consumption_requests.find_one({"id": req_id, "client_id": socio["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Pedido já {req.get('status')}, não pode ser alterado")
    if not body.items:
        raise HTTPException(status_code=400, detail="Sem itens")
    line_items = await _build_request_line_items(body.items, req["client_id"])
    total = round(sum(li["subtotal"] for li in line_items), 2)
    await _check_credit_limit(req["client_id"], total)
    await db.consumption_requests.update_one(
        {"id": req_id},
        {"$set": {"items": line_items, "total": total, "note": body.note, "edited_at": datetime.now(timezone.utc).isoformat()}},
    )
    updated = await db.consumption_requests.find_one({"id": req_id}, {"_id": 0})
    return updated

class SocioInsistIn(BaseModel):
    pass


@api_router.post("/socio/consumption-requests/{req_id}/insist")
async def socio_insist_request(req_id: str, socio: dict = Depends(get_current_socio)):
    """Sócio insiste num pedido em espera há mais de 5 min — staff recebe nova notificação."""
    req = await db.consumption_requests.find_one({"id": req_id, "client_id": socio["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Pedido já tratado")
    created = datetime.fromisoformat(req["created_at"])
    waited = (datetime.now(timezone.utc) - created).total_seconds()
    if waited < 5 * 60:
        rest = int(5 * 60 - waited)
        raise HTTPException(status_code=400, detail=f"O pedido só pode ser insistido 5 minutos após o envio (faltam {max(rest // 60, 1)} min)")
    await db.consumption_requests.update_one(
        {"id": req_id},
        {"$set": {"insisted_at": datetime.now(timezone.utc).isoformat()},
         "$inc": {"insist_count": 1}},
    )
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": socio["id"],
        "client_name": socio["name"],
        "subject": f"⚡ Insistência no pedido de consumo",
        "message": f"O sócio {socio['name']} está à espera há mais de 5 minutos e insistiu no pedido ({euro_fmt(req['total'])}).",
        "from_staff": False,
        "reply": None,
        "insist_request_id": req_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await _audit("request_insist", socio.get("name") or socio["id"], entity="consumption_request", entity_id=req_id, summary=f"Sócio {socio['name']} insistiu no pedido ({req['total']:.2f} €) após 5 min em espera")
    return {"ok": True}


@api_router.post("/socio/consumption-requests/{req_id}/picked-up")
async def socio_mark_picked_up(req_id: str, socio: dict = Depends(get_current_socio)):
    """O sócio confirma no portal que já levantou o pedido no balcão."""
    req = await db.consumption_requests.find_one({"id": req_id, "client_id": socio["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req.get("status") == "delivered":
        raise HTTPException(status_code=400, detail="Pedido já foi entregue")
    if req.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Só pedidos prontos a levantar podem ser marcados como levantados")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.consumption_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": "delivered",
            "delivered_at": now_iso,
            "delivered_by": f"socio:{socio.get('member_number') or socio['id']}",
            "picked_up_by_socio": True,
        }},
    )
    await _audit("request_picked_up_socio", f"socio:{socio.get('member_number') or socio['id']}", entity="consumption_request", entity_id=req_id,
                 summary=f"Sócio {socio['name']} confirmou no portal o levantamento do pedido ({euro_fmt(req['total'])})")
    await _mark_presence(socio["id"], source="request")
    return {"ok": True}


# ---------- Consumos entre sócios (deixar pago / delegar pagamento) ----------
# Um sócio pode deixar pago um consumo a outro sócio (prepaid) ou pedir-lhe
# para pagar a despesa (delegated — só é serviço quando o outro aceita e confirma).
# Estados: prepaid:  paid → claimed → served → consumed
#          delegated: requested → accepted → pending → served → consumed (ou rejected)
class SocioGiftIn(BaseModel):
    kind: str  # "prepaid" (deixar pago) | "delegated" (pedir a outro para pagar)
    recipient_id: str
    items: List[SaleItemIn]
    note: Optional[str] = None


class SocioGiftEditIn(BaseModel):
    items: List[SaleItemIn]
    note: Optional[str] = None


GIFT_STATUS_LABEL = {
    "requested": "à espera de aceitação",
    "accepted": "aceite · a confirmar",
    "rejected": "recusado",
    "paid": "pago · disponível",
    "claimed": "solicitado · a servir",
    "pending": "pendente a servir",
    "served": "servido",
    "consumed": "consumido",
}


async def _gift_notify(client_id: str, client_name: str, subject: str, message: str, gift_id: str):
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "client_name": client_name,
        "subject": subject,
        "message": message,
        "from_staff": True,
        "reply": None,
        "gift_id": gift_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _charge_gift_sale(payer: dict, line_items: list, total: float, gift_id: str, by: str) -> str:
    """Valida stock, cria a venda na conta de quem paga e desconta o stock."""
    pids = [it["product_id"] for it in line_items]
    prods = await db.products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(len(pids))
    pmap = {p["id"]: p for p in prods}
    for it in line_items:
        prod = pmap.get(it["product_id"])
        if not prod:
            raise HTTPException(status_code=400, detail=f"Produto {it['product_name']} foi removido")
        if prod["quantity"] < it["quantity"]:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {prod['name']}")
    for it in line_items:
        await db.products.update_one({"id": it["product_id"]}, {"$inc": {"quantity": -int(it["quantity"])}})
    sale_id = str(uuid.uuid4())
    tx_no = await _next_tx_number()
    is_member = bool(payer.get("is_member"))
    old_pending = float(payer.get("points_pending_value", 0)) if is_member else 0.0
    points_earned, new_pending = await _compute_points_with_rollover(payer, total)
    sale_doc = {
        "id": sale_id,
        "tx_number": tx_no,
        "client_id": payer["id"],
        "client_name": payer["name"],
        "items": line_items,
        "total": total,
        "points_earned": points_earned,
        "points_pending_before": old_pending,
        "points_pending_after": new_pending,
        "is_member_at_sale": is_member,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": by,
        "source": "socio_gift",
        "request_id": gift_id,
    }
    await db.sales.insert_one(sale_doc)
    op: dict = {"$inc": {"balance": total, "total_spent": total, "points": points_earned}}
    if is_member:
        op["$set"] = {"points_pending_value": new_pending}
    await db.clients.update_one({"id": payer["id"]}, op)
    if points_earned:
        await _log_points(payer["id"], points_earned, "sale", sale_id, f"Consumo entre sócios · {total:.2f} €", by)
    await _sync_quota_paid_status(payer["id"])
    return sale_id, tx_no


async def _ensure_gift_charged(gift: dict, by: str) -> dict:
    """Garante que o consumo entre sócios está lançado na conta de quem paga.
    Se quem paga confirmou no portal a venda já existe; caso contrário (o staff
    serviu/entregou primeiro) o valor é lançado agora — nunca fica sem transação."""
    if gift.get("sale_id"):
        return gift
    payer = await db.clients.find_one({"id": gift["payer_id"]}, {"_id": 0})
    if not payer:
        raise HTTPException(status_code=400, detail="Sócio que paga não encontrado")
    total = float(gift.get("total") or 0)
    await _check_credit_limit(payer["id"], total)
    sale_id, tx_no = await _charge_gift_sale(payer, gift["items"], total, gift["id"], by)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.socio_gifts.update_one(
        {"id": gift["id"]},
        {"$set": {"sale_id": sale_id, "tx_number": tx_no, "paid_at": now_iso, "charged_on_serve": True}},
    )
    await _gift_notify(
        gift["payer_id"], gift["payer_name"],
        "💳 Consumo lançado na tua conta",
        f"O consumo de {euro_fmt(total)} para {gift['recipient_name']} foi servido e ficou lançado na tua conta corrente (transação #{tx_no}).",
        gift["id"],
    )
    await _audit("socio_gift_charged", by, entity="socio_gift", entity_id=gift["id"], tx_number=tx_no,
                 summary=f"Consumo entre sócios lançado ao servir · {gift['payer_name']} paga {euro_fmt(total)} para {gift['recipient_name']}")
    return await db.socio_gifts.find_one({"id": gift["id"]}, {"_id": 0})


@api_router.get("/socio/members")
async def socio_list_members(socio: dict = Depends(get_current_socio)):
    """Lista de sócios (nome + nº) para escolher o destinatário de um consumo pago/delegado."""
    members = await db.clients.find(
        {"is_member": True, "member_number": {"$exists": True, "$ne": None}, "id": {"$ne": socio["id"]}},
        {"_id": 0, "id": 1, "name": 1, "member_number": 1, "is_minor": 1,
         "family_head_client_id": 1, "gifts_blocked": 1},
    ).to_list(2000)
    for m in members:
        m["is_minor"] = _is_minor_client(m)
        m["gifts_blocked"] = bool(m.get("gifts_blocked"))
    return sorted(members, key=lambda x: (x.get("member_number") or ""))


@api_router.get("/socio/gifts")
async def socio_my_gifts(socio: dict = Depends(get_current_socio)):
    """Consumos entre sócios em que este sócio é quem paga ou quem recebe."""
    q = {"$or": [{"payer_id": socio["id"]}, {"recipient_id": socio["id"]}]}
    items = await db.socio_gifts.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api_router.post("/socio/gifts")
async def socio_create_gift(body: SocioGiftIn, socio: dict = Depends(get_current_socio)):
    if body.kind not in ("prepaid", "delegated"):
        raise HTTPException(status_code=400, detail="Tipo inválido")
    if not body.items:
        raise HTTPException(status_code=400, detail="Sem itens")
    if any(str(it.product_id).startswith("quota-") for it in body.items):
        raise HTTPException(status_code=400, detail="Não é possível incluir cotas num consumo de outro sócio")
    other = await db.clients.find_one({"id": body.recipient_id}, {"_id": 0, "pin_hash": 0})
    if not other or not other.get("is_member"):
        raise HTTPException(status_code=404, detail="Sócio destinatário não encontrado")
    if other["id"] == socio["id"]:
        raise HTTPException(status_code=400, detail="Não podes escolher-te a ti próprio")
    # Menores tutelados só podem PEDIR a outro sócio para pagar — nunca pagam
    # consumos de outros sócios nem são escolhidos para pagar.
    if _is_minor_client(socio):
        raise HTTPException(status_code=403, detail="Conta tutelada: só podes pedir a outro sócio para pagar o teu consumo.")
    if body.kind == "delegated" and _is_minor_client(other):
        raise HTTPException(status_code=403, detail="Sócios tutelados não podem pagar consumos de outros sócios.")
    if body.kind == "delegated" and other.get("gifts_blocked"):
        raise HTTPException(status_code=403, detail=f"{other['name']} bloqueou os pedidos de pagamento entre sócios.")
    gid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    socio_label = f"{socio['name']} (nº {socio.get('member_number') or '—'})"
    other_label = f"{other['name']} (nº {other.get('member_number') or '—'})"
    # recipient_* é sempre QUEM CONSUME; payer_* é QUEM PAGA
    if body.kind == "prepaid":
        payer, consumer = socio, other
    else:
        # Delegar pagamento: o sócio escolhido é quem paga; quem pede é quem consome
        payer, consumer = other, socio
    line_items = await _build_request_line_items(body.items, consumer["id"], minor=_is_minor_client(consumer))
    total = round(sum(li["subtotal"] for li in line_items), 2)
    doc = {
        "id": gid,
        "kind": body.kind,
        "payer_id": payer["id"],
        "payer_name": payer["name"],
        "payer_member_number": payer.get("member_number"),
        "recipient_id": consumer["id"],
        "recipient_name": consumer["name"],
        "recipient_member_number": consumer.get("member_number"),
        "items": line_items,
        "total": total,
        "note": body.note,
        "created_at": now_iso,
        "sale_id": None,
    }
    if body.kind == "prepaid":
        # Deixar pago: o pagamento é imediato na conta de quem paga
        await _check_credit_limit(payer["id"], total)
        sale_id, tx_no = await _charge_gift_sale(payer, line_items, total, gid, socio.get("email") or "socio-self")
        doc["status"] = "paid"
        doc["sale_id"] = sale_id
        doc["tx_number"] = tx_no
        doc["paid_at"] = now_iso
        await _gift_notify(
            consumer["id"], consumer["name"],
            "🎁 Consumo pago para ti",
            f"O sócio {socio_label} deixou-te pago um consumo de {euro_fmt(total)} — já está disponível para levantar ao balcão. No portal, clica em 'Solicitar bónus'.",
            gid,
        )
        await _gift_notify(
            socio["id"], socio["name"],
            "✅ Consumo pago",
            f"Registámos o teu pagamento de {euro_fmt(total)} para o sócio {other_label}. O produto ficou pago — serás notificado quando for consumido.",
            gid,
        )
        await _audit("socio_gift_prepaid", f"socio:{socio.get('member_number') or socio['id']}", entity="socio_gift", entity_id=gid,
                     summary=f"{socio_label} deixou pago um consumo de {euro_fmt(total)} a {other_label}")
    else:
        doc["status"] = "requested"
        await _gift_notify(
            payer["id"], payer["name"],
            "🔔 Pedido para pagares um consumo",
            f"O sócio {socio_label} pediu-te para pagares um consumo de {euro_fmt(total)}. No portal podes aceitar ou recusar — se aceitares, podes editar os itens antes de confirmar.",
            gid,
        )
        await _audit("socio_gift_delegated", f"socio:{socio.get('member_number') or socio['id']}", entity="socio_gift", entity_id=gid,
                     summary=f"{socio_label} delegou pagamento de {euro_fmt(total)} a {other_label}")
    await db.socio_gifts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/socio/gifts/{gift_id}")
async def socio_edit_gift(gift_id: str, body: SocioGiftEditIn, socio: dict = Depends(get_current_socio)):
    """Quem paga (delegado) pode editar os itens enquanto o pedido estiver por aceitar/aceite e por confirmar."""
    gift = await db.socio_gifts.find_one({"id": gift_id}, {"_id": 0})
    if not gift:
        raise HTTPException(status_code=404, detail="Consumo não encontrado")
    if gift.get("payer_id") != socio["id"]:
        raise HTTPException(status_code=403, detail="Só quem paga pode editar")
    if gift.get("status") not in ("requested", "accepted"):
        raise HTTPException(status_code=400, detail="Só pedidos por aceitar ou aceites podem ser editados")
    if not body.items:
        raise HTTPException(status_code=400, detail="Sem itens")
    if any(str(it.product_id).startswith("quota-") for it in body.items):
        raise HTTPException(status_code=400, detail="Não é possível incluir cotas num consumo de outro sócio")
    recipient = await db.clients.find_one({"id": gift["recipient_id"]}, {"_id": 0})
    line_items = await _build_request_line_items(body.items, gift["recipient_id"], minor=_is_minor_client(recipient or {}))
    total = round(sum(li["subtotal"] for li in line_items), 2)
    await db.socio_gifts.update_one(
        {"id": gift_id},
        {"$set": {"items": line_items, "total": total, "note": body.note, "edited_at": datetime.now(timezone.utc).isoformat()}},
    )
    return await db.socio_gifts.find_one({"id": gift_id}, {"_id": 0})


@api_router.post("/socio/gifts/{gift_id}/accept")
async def socio_accept_gift(gift_id: str, socio: dict = Depends(get_current_socio)):
    """O sócio convidado a pagar aceita a despesa — depois pode editar itens e confirmar."""
    gift = await db.socio_gifts.find_one({"id": gift_id}, {"_id": 0})
    if not gift:
        raise HTTPException(status_code=404, detail="Consumo não encontrado")
    if gift.get("payer_id") != socio["id"]:
        raise HTTPException(status_code=403, detail="Só quem foi convidado a pagar pode aceitar")
    if gift.get("kind") != "delegated" or gift.get("status") != "requested":
        raise HTTPException(status_code=400, detail="Este pedido já não pode ser aceite")
    await db.socio_gifts.update_one({"id": gift_id}, {"$set": {"status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat()}})
    await _gift_notify(
        gift["recipient_id"], gift["recipient_name"],
        "👍 Pedido aceite",
        f"O sócio {socio['name']} (nº {socio.get('member_number') or '—'}) aceitou pagar o teu pedido de {euro_fmt(gift['total'])} — quando confirmar, fica pendente a servir.",
        gift_id,
    )
    return {"ok": True}


@api_router.post("/socio/gifts/{gift_id}/reject")
async def socio_reject_gift(gift_id: str, socio: dict = Depends(get_current_socio)):
    """O sócio convidado a pagar recusa — o pedido não gera qualquer despesa."""
    gift = await db.socio_gifts.find_one({"id": gift_id}, {"_id": 0})
    if not gift:
        raise HTTPException(status_code=404, detail="Consumo não encontrado")
    if gift.get("payer_id") != socio["id"]:
        raise HTTPException(status_code=403, detail="Só quem foi convidado a pagar pode recusar")
    if gift.get("kind") != "delegated" or gift.get("status") != "requested":
        raise HTTPException(status_code=400, detail="Este pedido já não pode ser recusado")
    await db.socio_gifts.update_one({"id": gift_id}, {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat()}})
    await _gift_notify(
        gift["recipient_id"], gift["recipient_name"],
        "❌ Pedido recusado",
        f"O sócio {socio['name']} recusou pagar o teu pedido de {euro_fmt(gift['total'])}. Nada foi cobrado.",
        gift_id,
    )
    return {"ok": True}


@api_router.post("/socio/gifts/{gift_id}/confirm")
async def socio_confirm_gift(gift_id: str, socio: dict = Depends(get_current_socio)):
    """Quem pagou (delegado) confirma — o pedido fica pendente a servir e a despesa é lançada na conta dele."""
    gift = await db.socio_gifts.find_one({"id": gift_id}, {"_id": 0})
    if not gift:
        raise HTTPException(status_code=404, detail="Consumo não encontrado")
    if gift.get("payer_id") != socio["id"]:
        raise HTTPException(status_code=403, detail="Só quem paga pode confirmar")
    if gift.get("kind") != "delegated" or gift.get("status") not in ("accepted", "claimed"):
        raise HTTPException(status_code=400, detail="Este pedido já foi confirmado")
    payer = await db.clients.find_one({"id": socio["id"]}, {"_id": 0})
    await _check_credit_limit(payer["id"], gift["total"])
    sale_id, tx_no = await _charge_gift_sale(payer, gift["items"], gift["total"], gift_id, socio.get("email") or "socio-self")
    now_iso = datetime.now(timezone.utc).isoformat()
    # Se o consumidor já pediu ao balcão, mantém 'claimed'; senão fica pendente a servir
    new_status = "claimed" if gift.get("status") == "claimed" else "pending"
    await db.socio_gifts.update_one(
        {"id": gift_id},
        {"$set": {"status": new_status, "sale_id": sale_id, "tx_number": tx_no, "paid_at": now_iso, "confirmed_at": now_iso}},
    )
    await _gift_notify(
        gift["recipient_id"], gift["recipient_name"],
        "🔔 Pagamento confirmado",
        f"O sócio {socio['name']} confirmou o pagamento do teu pedido de {euro_fmt(gift['total'])} — ficou pendente a servir.",
        gift_id,
    )
    await _audit("socio_gift_confirmed", f"socio:{socio.get('member_number') or socio['id']}", entity="socio_gift", entity_id=gift_id,
                 summary=f"{socio['name']} confirmou pagar {euro_fmt(gift['total'])} — pedido pendente a servir")
    return {"ok": True}


@api_router.post("/socio/gifts/{gift_id}/claim")
async def socio_claim_gift(gift_id: str, socio: dict = Depends(get_current_socio)):
    """Destinatário solicita o bónus pago — staff é avisado para servir."""
    gift = await db.socio_gifts.find_one({"id": gift_id}, {"_id": 0})
    if not gift:
        raise HTTPException(status_code=404, detail="Consumo não encontrado")
    if gift.get("recipient_id") != socio["id"]:
        raise HTTPException(status_code=403, detail="Só o destinatário pode solicitar")
    if gift.get("status") not in ("paid", "accepted"):
        raise HTTPException(status_code=400, detail="Este consumo já foi solicitado")
    was_accepted = gift.get("status") == "accepted"
    await db.socio_gifts.update_one({"id": gift_id}, {"$set": {"status": "claimed", "claimed_at": datetime.now(timezone.utc).isoformat()}})
    if was_accepted:
        # Consumidor pediu o serviço ao balcão antes do pagamento confirmado — lembra quem paga
        await _gift_notify(
            gift["payer_id"], gift["payer_name"],
            "🔔 Confirma o pagamento",
            f"O sócio {socio['name']} já pediu o consumo ao balcão — confirma o pagamento de {euro_fmt(gift['total'])} no portal.",
            gift_id,
        )
    await _audit("socio_gift_claimed", f"socio:{socio.get('member_number') or socio['id']}", entity="socio_gift", entity_id=gift_id,
                 summary=f"{socio['name']} solicitou o bónus pago de {euro_fmt(gift['total'])} (pago por {gift['payer_name']})")
    return {"ok": True}


@api_router.post("/socio/gifts/{gift_id}/consume")
async def socio_consume_gift(gift_id: str, socio: dict = Depends(get_current_socio)):
    """Destinatário confirma que consumiu o que lhe foi servido."""
    gift = await db.socio_gifts.find_one({"id": gift_id}, {"_id": 0})
    if not gift:
        raise HTTPException(status_code=404, detail="Consumo não encontrado")
    if socio["id"] not in (gift.get("recipient_id"), gift.get("payer_id")):
        raise HTTPException(status_code=403, detail="Só o consumidor ou quem pagou pode confirmar o consumo")
    if gift.get("status") != "served":
        raise HTTPException(status_code=400, detail="Só consumos já servidos podem ser confirmados")
    await db.socio_gifts.update_one({"id": gift_id}, {"$set": {"status": "consumed", "consumed_at": datetime.now(timezone.utc).isoformat()}})
    await _gift_notify(
        gift["payer_id"], gift["payer_name"],
        "✅ Consumo confirmado",
        f"O sócio {socio['name']} confirmou o consumo do produto que pagou ({euro_fmt(gift['total'])}). Obrigado!",
        gift_id,
    )
    return {"ok": True}


# ---------- Staff: consumos entre sócios ----------
@api_router.get("/socio-gifts")
async def staff_list_gifts(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: dict = {}
    if status_filter == "active":
        q["status"] = {"$in": ["claimed", "pending", "served"]}
    elif status_filter:
        q["status"] = status_filter
    items = await db.socio_gifts.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.post("/socio-gifts/{gift_id}/serve")
async def staff_serve_gift(gift_id: str, user: dict = Depends(get_current_user)):
    """Staff entrega o consumo — destinatário é avisado para confirmar no portal."""
    gift = await db.socio_gifts.find_one({"id": gift_id}, {"_id": 0})
    if not gift:
        raise HTTPException(status_code=404, detail="Consumo não encontrado")
    if gift.get("status") not in ("claimed", "pending"):
        raise HTTPException(status_code=400, detail="Só consumos solicitados ou pendentes podem ser servidos")
    # Se quem paga ainda não confirmou no portal, o valor é lançado agora na conta dele
    gift = await _ensure_gift_charged(gift, user["email"])
    await db.socio_gifts.update_one({"id": gift_id}, {"$set": {"status": "served", "served_at": datetime.now(timezone.utc).isoformat(), "served_by": user["email"]}})
    await _gift_notify(
        gift["recipient_id"], gift["recipient_name"],
        "🎉 Consumo servido",
        f"O consumo de {euro_fmt(gift['total'])} (pago por {gift['payer_name']}) já foi servido — confirma no portal em 'Consumido'.",
        gift_id,
    )
    await _audit("socio_gift_served", user["email"], entity="socio_gift", entity_id=gift_id,
                 summary=f"Consumo de {euro_fmt(gift['total'])} servido a {gift['recipient_name']} (pago por {gift['payer_name']})")
    return {"ok": True}


@api_router.post("/socio-gifts/{gift_id}/confirm-consumed")
async def staff_confirm_gift_consumed(gift_id: str, user: dict = Depends(get_current_user)):
    """Staff confirma a recolha/consumo no balcão."""
    gift = await db.socio_gifts.find_one({"id": gift_id}, {"_id": 0})
    if not gift:
        raise HTTPException(status_code=404, detail="Consumo não encontrado")
    if gift.get("status") != "served":
        raise HTTPException(status_code=400, detail="Só consumos já servidos podem ser confirmados")
    # Consumos antigos servidos sem lançamento ficam regularizados aqui
    gift = await _ensure_gift_charged(gift, user["email"])
    await db.socio_gifts.update_one({"id": gift_id}, {"$set": {"status": "consumed", "consumed_at": datetime.now(timezone.utc).isoformat(), "consumed_by": user["email"]}})
    await _gift_notify(
        gift["recipient_id"], gift["recipient_name"],
        "✅ Consumo confirmado",
        f"O staff confirmou a recolha do teu consumo ({euro_fmt(gift['total'])}). Obrigado!",
        gift_id,
    )
    await _gift_notify(
        gift["payer_id"], gift["payer_name"],
        "✅ Consumo confirmado",
        f"O staff confirmou a recolha do consumo que pagaste para {gift['recipient_name']} ({euro_fmt(gift['total'])}). Obrigado!",
        gift_id,
    )
    await _audit("socio_gift_consumed", user["email"], entity="socio_gift", entity_id=gift_id,
                 summary=f"Recolha confirmada pelo staff — consumo de {euro_fmt(gift['total'])} ({gift['recipient_name']}, pago por {gift['payer_name']})")
    return {"ok": True}


def euro_fmt(v: float) -> str:
    return f"{float(v):.2f}".replace(".", ",") + " €"


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


@api_router.get("/socio/bar-status")
async def socio_bar_status(socio: dict = Depends(get_current_socio)):
    """Estado do bar para a app do sócio (pedir consumo bloqueado quando fechado)."""
    state = await _bar_state()
    if not state["open"]:
        doc = await db.club_state.find_one({"_id": "bar"}, {"_id": 0})
        if doc and doc.get("open"):
            # fecha de facto (fecho automático às 02:00)
            await db.club_state.update_one({"_id": "bar"}, {"$set": {"open": False, "changed_at": state["now"], "changed_by": "auto"}})
    return {"open": state["open"]}

async def _socio_has_open_quotas(client_id: str, year: int) -> bool:
    """Cotas por regularizar = meses JÁ VENCIDOS (até ao mês corrente) sem pagamento.
    Cotas futuras (ainda não vencidas) nunca bloqueiam o sócio."""
    qs = await _quotas_status(client_id, year)
    try:
        from zoneinfo import ZoneInfo
        cur = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        cur = datetime.now(timezone.utc)
    if year < cur.year:
        months = qs
    elif year > cur.year:
        months = []
    else:
        months = [q for q in qs if q["month"] <= cur.month]
    return any(q["status"] != "paid" for q in months)

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
        if status_filter == "open":
            # Pedidos antigos (ex.: recuperação de PIN) podem não ter 'status' — contam como abertos
            q["$or"] = [{"status": "open"}, {"from_staff": False, "status": {"$exists": False}}]
        else:
            q["status"] = status_filter
    items = await db.socio_messages.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Pedidos antigos sem 'status' contam como abertos (não ficam "presos" na interface)
    for it in items:
        if not it.get("from_staff") and not it.get("status"):
            it["status"] = "open"
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


@api_router.post("/socio-messages/{msg_id}/staff-read")
async def staff_mark_message_read(msg_id: str, user: dict = Depends(get_current_user)):
    """O staff marca uma mensagem de sócio como lida (sem responder)."""
    msg = await db.socio_messages.find_one({"id": msg_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await db.socio_messages.update_one(
        {"id": msg_id},
        {"$set": {"staff_read_at": datetime.now(timezone.utc).isoformat(), "staff_read_by": user["email"]}},
    )
    return await db.socio_messages.find_one({"id": msg_id}, {"_id": 0})


# ---------- Notificações do sócio (mensagens do staff) com confirmação de leitura ----------
def _socio_notif_query(client_id: str, unread_only: bool = False):
    """Mensagens que são notificações para o sócio: enviadas pelo staff ou respostas do staff."""
    q: dict = {"client_id": client_id, "$or": [{"from_staff": True}, {"status": "replied"}]}
    if unread_only:
        q["read_at"] = {"$exists": False}
    return q


class SocioMessagesReadIn(BaseModel):
    ids: Optional[List[str]] = None  # None/todos = marcar todas as notificações como lidas


@api_router.post("/socio/messages/read")
async def socio_mark_messages_read(body: SocioMessagesReadIn, socio: dict = Depends(get_current_socio)):
    """O sócio abre a mensagem → marca como lida. O emissor (staff) vê a confirmação."""
    q = _socio_notif_query(socio["id"], unread_only=True)
    if body.ids:
        q["id"] = {"$in": body.ids}
    # Avisos de levantamento lidos: o pedido fica marcado — se não for recolhido
    # nos 10 minutos seguintes é anulado automaticamente
    now_iso = datetime.now(timezone.utc).isoformat()
    pending_reads = await db.socio_messages.find(
        {**q, "request_id": {"$exists": True, "$ne": None}}, {"_id": 0, "request_id": 1}
    ).to_list(200)
    for m in pending_reads:
        await db.consumption_requests.update_one(
            {"id": m["request_id"], "status": "approved"},
            {"$set": {"pickup_read_at": now_iso, "pickup_read_by_socio": True}},
        )
    res = await db.socio_messages.update_many(q, {"$set": {"read_at": now_iso}})
    return {"ok": True, "count": res.modified_count}


@api_router.get("/socio/notifications")
async def socio_notifications(socio: dict = Depends(get_current_socio)):
    """Notificações do portal do sócio: contadores + lista das mais recentes."""
    unread_messages = await db.socio_messages.count_documents(_socio_notif_query(socio["id"], unread_only=True))
    notif_items = await db.socio_messages.find(
        _socio_notif_query(socio["id"]),
        {"_id": 0, "id": 1, "subject": 1, "message": 1, "created_at": 1, "read_at": 1,
         "request_id": 1, "gift_id": 1, "reply": 1},
    ).sort("created_at", -1).to_list(100)
    # mensagens da comunidade ainda não vistas (mesma lógica do GET /community/messages)
    items = await db.community_messages.find({"status": "visible"}, {"_id": 0, "created_at": 1}).sort("created_at", -1).to_list(200)
    last_seen = await db.clients.find_one({"id": socio["id"]}, {"community_last_seen": 1, "_id": 0}) or {}
    community_unseen = sum(1 for m in items if (last_seen.get("community_last_seen") or "") < m["created_at"])
    for it in notif_items:
        it["read"] = bool(it.get("read_at"))
    return {"unread_messages": unread_messages, "community_unseen": community_unseen, "items": notif_items}


# ---------- Staff responde/publica no chat da comunidade ----------
class CommunityStaffPostIn(BaseModel):
    message: str
    reply_to: Optional[str] = None


@api_router.post("/community/messages/staff-post")
async def staff_post_community_message(body: CommunityStaffPostIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente", "funcionario"))):
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    masked = _mask_profanity(msg[:2000])
    parent = None
    if body.reply_to:
        parent = await db.community_messages.find_one({"id": body.reply_to, "status": "visible"}, {"_id": 0, "id": 1})
        if not parent:
            raise HTTPException(status_code=404, detail="Mensagem original não encontrada")
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": None,
        "author_name": user.get("name") or user.get("email") or "Direção",
        "message": masked,
        "original_masked": masked != msg,
        "reply_to": body.reply_to if body.reply_to else None,
        "status": "visible",
        "reports": [],
        "from_staff": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.community_messages.insert_one(doc)
    doc.pop("_id", None)
    await _audit("community_staff_post", user["email"], entity="community_message", entity_id=doc["id"], summary="Mensagem publicada pela direção no chat da comunidade")
    return doc


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
    withdrawals = await db.cash_withdrawals.find(exp_q, {"_id": 0}).sort("created_at", -1).to_list(5000)

    # Detalhe de despesas: sem nomes de sócios (substituídos pelo nº de sócio) e com nº de factura
    all_members = await db.clients.find(
        {"is_member": True, "member_number": {"$exists": True, "$ne": None}},
        {"_id": 0, "name": 1, "member_number": 1},
    ).to_list(2000)
    member_names = {c["name"].strip().lower(): str(c["member_number"]) for c in all_members if c.get("name")}

    def _no_member_names(text: str) -> str:
        t = str(text or "")
        for name, mn in member_names.items():
            t = re.sub(re.escape(name), f"sócio nº {mn}", t, flags=re.IGNORECASE)
        return t

    for o in orders:
        desc = ", ".join(f"{it.get('quantity', 1)}× {it.get('product_name')}" for it in (o.get("items") or []))
        if o.get("invoice_ref"):
            desc = f"{desc} · Factura {o['invoice_ref']}" if desc else f"Factura {o['invoice_ref']}"
        o["description"] = _no_member_names(desc)
        o["supplier_member_number"] = member_names.get((o.get("supplier_name") or "").strip().lower(), "")
    for e in expenses:
        desc = e.get("description") or ""
        if e.get("invoice_no"):
            desc = f"{desc} · Factura {e['invoice_no']}" if desc else f"Factura {e['invoice_no']}"
        e["description"] = _no_member_names(desc)
        e["supplier_member_number"] = member_names.get((e.get("supplier_name") or "").strip().lower(), "")

    # Donativos/gratificações superiores a 10 € entregues em conta corrente
    payments = await db.payments.find(exp_q, {"_id": 0}).sort("created_at", -1).to_list(10000)
    donations = [p for p in payments if float(p.get("tip") or 0) > 10.0]
    rev_donations = round(sum(float(p.get("tip") or 0) for p in donations), 2)

    # Nº de sócio de cada cliente (para o PDF usar o nº em vez do nome)
    cids = list({s["client_id"] for s in sales if s.get("client_id")} | {p["client_id"] for p in donations if p.get("client_id")})
    members = await db.clients.find({"id": {"$in": cids}}, {"id": 1, "member_number": 1}).to_list(len(cids)) if cids else []
    member_map = {c["id"]: c.get("member_number") or "" for c in members}
    for s in sales:
        s["client_member_number"] = member_map.get(s.get("client_id"), "")
    for p in donations:
        p["client_member_number"] = member_map.get(p.get("client_id"), "")

    sales_consumo = [s for s in sales if s.get("source") != "quota"]
    sales_cotas = [s for s in sales if s.get("source") == "quota"]
    rev_consumo = sum(s.get("total", 0) for s in sales_consumo)
    rev_cotas = sum(s.get("total", 0) for s in sales_cotas)
    rev_total = rev_consumo + rev_cotas + rev_donations

    # Depósitos bancários vão para o banco; devoluções de crédito só reduzem a
    # caixa; pagamentos de despesas (expense_cash/expense_bank) já contam nas
    # encomendas/despesas — não somar aqui para evitar duplicação
    bank_deposits = [w for w in withdrawals if w.get("kind") == "bank_deposit"]
    credit_refunds = [w for w in withdrawals if w.get("kind") == "credit_refund"]
    expense_payments = [w for w in withdrawals if w.get("kind") in ("expense_cash", "expense_bank")]
    exp_orders = sum(o.get("total", 0) for o in orders)
    exp_expenses = sum(e.get("amount", 0) for e in expenses)
    exp_withdrawals = sum(w.get("amount", 0) for w in bank_deposits)
    exp_refunds = sum(w.get("amount", 0) for w in credit_refunds)
    # Transferências caixa ↔ banco são movimentação de saldo, NUNCA despesa
    exp_total = exp_orders + exp_expenses

    return {
        "period": {"from": date_from, "to": date_to},
        "income": {
            "consumption": rev_consumo,
            "quotas": rev_cotas,
            "donations": rev_donations,
            "total": rev_total,
        },
        "expenses": {
            "supplier_orders": exp_orders,
            "supplier_expenses": exp_expenses,
            "cash_withdrawals": exp_withdrawals,
            "credit_refunds": exp_refunds,
            "total": exp_total,
        },
        "balance": rev_total - exp_total,
        "counts": {
            "sales": len(sales_consumo),
            "quotas": len(sales_cotas),
            "donations": len(donations),
            "orders": len(orders),
            "expenses": len(expenses),
            "withdrawals": len(bank_deposits),
            "expense_payments": len(expense_payments),
            "credit_refunds": len(credit_refunds),
        },
        "details": {
            "sales": sales_consumo,
            "quotas": sales_cotas,
            "donations": donations,
            "orders": orders,
            "expenses": expenses,
            "withdrawals": withdrawals,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "club_name": CLUB_NAME,
    }

@api_router.get("/reports/finance")
async def report_finance(date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    if user.get("role") == "funcionario":
        date_from, date_to = _clamp_month_range(date_from, date_to)
    return await _finance_summary(date_from, date_to)

@api_router.get("/socio/finance")
async def socio_finance_summary(date_from: Optional[str] = None, date_to: Optional[str] = None, socio: dict = Depends(get_current_socio)):
    """Resumo financeiro do clube para TODOS os sócios — apenas totalizadores (sem detalhes nominais).
    Por omissão: mês corrente."""
    now = datetime.now(timezone.utc)
    date_from = date_from or now.strftime("%Y-%m-01")
    date_to = date_to or now.strftime("%Y-%m-%d")
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

@api_router.get("/socio/expenses-quarterly")
async def socio_expenses_quarterly(socio: dict = Depends(get_current_socio)):
    """Despesas do trimestre corrente do clube — detalhe para consulta do sócio
    (descrições sem nomes de sócios, substituídos pelo nº de sócio)."""
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    quarter = (now.month - 1) // 3 + 1
    start_month = 3 * (quarter - 1) + 1
    date_from = f"{now.year}-{start_month:02d}-01"
    date_to = now.strftime("%Y-%m-%d")
    data = await _finance_summary(date_from, date_to)
    items = []
    for o in data["details"]["orders"]:
        items.append({
            "date": o.get("created_at"),
            "kind": "Encomenda",
            "description": o.get("description") or "Encomenda a fornecedor",
            "supplier": o.get("supplier_name") or "—",
            "amount": round(float(o.get("total") or 0), 2),
        })
    for e in data["details"]["expenses"]:
        items.append({
            "date": e.get("created_at"),
            "kind": "Despesa",
            "description": e.get("description") or "Despesa",
            "supplier": e.get("supplier_name") or "—",
            "amount": round(float(e.get("amount") or 0), 2),
        })
    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    return {
        "quarter": f"T{quarter}/{now.year}",
        "period": {"from": date_from, "to": date_to},
        "total": data["expenses"]["total"],
        "supplier_orders": data["expenses"]["supplier_orders"],
        "supplier_expenses": data["expenses"]["supplier_expenses"],
        "count": len(items),
        "items": items,
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
    mbway_phone: str = ""
    pay_at_counter: bool = False  # pagar ao balcão — valor lançado na conta corrente


class SocioQuotaSettingsIn(BaseModel):
    monthly_value: Optional[float] = None
    honorary_annual_value: Optional[float] = None


class SocioHonoraryIn(BaseModel):
    annual_value: float


@api_router.get("/socio/quota-settings")
async def socio_quota_settings(socio: dict = Depends(get_current_socio)):
    status = await _quota_overall_status(socio["id"])
    return {
        "monthly_value": _quota_amount(socio),
        "club_monthly_value": QUOTA_MONTHLY_VALUE,
        "is_honorary": bool(socio.get("is_honorary")),
        "honorary_since": socio.get("honorary_since"),
        "honorary_annual_value": float(socio.get("honorary_annual_value") or 0),
        "honorary_min_annual": 20.0,
        "quota_status": status,
    }


@api_router.put("/socio/quota-settings")
async def socio_update_quota_settings(body: SocioQuotaSettingsIn, socio: dict = Depends(get_current_socio)):
    update = {}
    if body.monthly_value is not None:
        value = round(float(body.monthly_value), 2)
        if value < QUOTA_MONTHLY_VALUE:
            raise HTTPException(status_code=400, detail=f"O valor da quota mensal não pode ser inferior a {QUOTA_MONTHLY_VALUE:.2f} €")
        if value > 1000:
            raise HTTPException(status_code=400, detail="Valor de quota inválido")
        update["quota_monthly_value"] = value
    if body.honorary_annual_value is not None:
        value = round(float(body.honorary_annual_value), 2)
        if value < 20:
            raise HTTPException(status_code=400, detail="A quota anual de sócio honorário tem um mínimo de 20 €")
        update["honorary_annual_value"] = value
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    await db.clients.update_one({"id": socio["id"]}, {"$set": update})
    return await socio_quota_settings(socio)


@api_router.post("/socio/honorary/activate")
async def socio_activate_honorary(body: SocioHonoraryIn, socio: dict = Depends(get_current_socio)):
    """Ativa o estatuto de Sócio Honorário 👔 e liquida automaticamente os 12 meses do ano corrente."""
    if not socio.get("is_member"):
        raise HTTPException(status_code=400, detail="Apenas sócios podem ser honorários")
    annual = round(float(body.annual_value), 2)
    if annual < 20:
        raise HTTPException(status_code=400, detail="A quota anual de sócio honorário tem um mínimo de 20 €")
    try:
        from zoneinfo import ZoneInfo
        year = datetime.now(ZoneInfo("Europe/Lisbon")).year
    except Exception:
        year = datetime.now(timezone.utc).year
    per = round(annual / 12, 2)
    amounts = [per] * 11 + [round(annual - per * 11, 2)]
    now_iso = datetime.now(timezone.utc).isoformat()
    sale_id = str(uuid.uuid4())
    tx_no = await _next_tx_number()
    items = [{
        "product_id": f"quota-honorary-{year}-{m:02d}",
        "product_name": f"Quota honorária {MONTHS_PT[m-1]}/{year}",
        "unit_price": amounts[m - 1],
        "quantity": 1,
        "subtotal": amounts[m - 1],
    } for m in range(1, 13)]
    sale = {
        "id": sale_id,
        "tx_number": tx_no,
        "client_id": socio["id"],
        "client_name": socio["name"],
        "items": items,
        "total": annual,
        "points_earned": 0,
        "is_member_at_sale": True,
        "created_at": now_iso,
        "user_email": socio.get("email") or "socio-self",
        "source": "quota_honorary",
    }
    await db.sales.insert_one(sale)
    pay_id = str(uuid.uuid4())
    pay_tx = await _next_tx_number()
    pay = {
        "id": pay_id,
        "tx_number": pay_tx,
        "client_id": socio["id"],
        "client_name": socio["name"],
        "amount": annual,
        "tendered": annual,
        "total_credited": annual,
        "change_returned": 0.0,
        "points_used": 0,
        "points_value": 0.0,
        "note": f"Quota anual de sócio honorário {year}",
        "created_at": now_iso,
        "user_email": socio.get("email") or "socio-self",
        "source": "mbway",
        "sale_ids": [sale_id],
        "sale_tx_numbers": [tx_no],
    }
    await db.payments.insert_one(pay)
    for m in range(1, 13):
        await db.quotas.update_one(
            {"client_id": socio["id"], "year": year, "month": m},
            {"$set": {
                "client_id": socio["id"], "year": year, "month": m,
                "status": "paid", "amount": amounts[m - 1],
                "paid_at": now_iso, "sale_id": sale_id,
                "user_email": socio.get("email") or "socio-self",
            }, "$unset": {"reversed": ""}},
            upsert=True,
        )
    await db.clients.update_one(
        {"id": socio["id"]},
        {"$set": {
            "is_honorary": True,
            "honorary_annual_value": annual,
            "honorary_since": year,
        }, "$inc": {"total_spent": annual, "balance": 0}},
    )
    await _audit(
        "honorary_activate", socio.get("email") or "socio-self",
        entity="client", entity_id=socio["id"],
        summary=f"Sócio Honorário 👔 ativado · quota anual {annual:.2f} € · 12 meses de {year} liquidados (venda #{tx_no}, pagamento #{pay_tx})",
    )
    return {"ok": True, "annual_value": annual, "year": year, "sale": sale, "payment": pay}


@api_router.post("/socio/quotas/pay")
async def socio_pay_quotas(body: SocioQuotaPayIn, socio: dict = Depends(get_current_socio)):
    """Sócio pede para pagar cotas via MBWay (pedido pendente) ou ao balcão (conta corrente)."""
    if _is_tutelado(socio):
        raise HTTPException(status_code=403, detail="Sócio tutelado: as cotas são regularizadas pelo tutor na App Sócio ou ao balcão")
    if not body.months:
        raise HTTPException(status_code=400, detail="Sem meses selecionados")
    already = await db.quotas.find({"client_id": socio["id"], "year": body.year, "month": {"$in": body.months}, "status": {"$in": ["paid", "billed"]}, "reversed": {"$ne": True}}, {"_id": 0}).to_list(20)
    if already:
        raise HTTPException(status_code=400, detail=f"Já lançadas na conta corrente: {', '.join(MONTHS_PT[a['month']-1] for a in already)}")
    unit = _quota_amount(socio)
    total = round(unit * len(body.months), 2)
    # O pedido do sócio NUNCA lança cotas diretamente: fica pendente até a direção
    # confirmar (MBWay ou pagamento ao balcão).
    rec = {
        "id": str(uuid.uuid4()),
        "client_id": socio["id"],
        "client_name": socio["name"],
        "amount": total,
        "mbway_phone": (body.mbway_phone or "").strip(),
        "note": f"Cotas {body.year}: {', '.join(MONTHS_PT[m-1] for m in body.months)}"
                + (" · a pagar ao balcão" if body.pay_at_counter else ""),
        "status": "pending",
        "kind": "quota",
        "pay_at_counter": bool(body.pay_at_counter),
        "quota_year": body.year,
        "quota_months": body.months,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_at": None,
        "confirmed_by": None,
    }
    await db.mbway_payments.insert_one(rec)
    await _audit(
        "quota_payment_request", f"socio:{socio.get('member_number') or socio['id']}",
        entity="mbway", entity_id=rec["id"],
        summary=f"Pedido de cotas {body.year} ({', '.join(MONTHS_PT[m-1] for m in body.months)}) · "
                f"{total:.2f} € · {'ao balcão' if body.pay_at_counter else 'MBWay'} · aguarda aprovação",
    )
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
    tx_no = await _next_tx_number()
    pay = {
        "id": pid,
        "tx_number": tx_no,
        "client_id": socio["id"],
        "client_name": socio["name"],
        "amount": float(euros),
        "tendered": float(euros),
        "total_credited": float(euros),
        "change_returned": 0.0,
        "points_used": int(body.points),
        "points_value": float(euros),
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
    await _sync_quota_paid_status(socio["id"])
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

async def _apply_mbway_confirm(mb: dict, user: dict) -> dict:
    """Aplica o efeito financeiro da confirmação de um pedido MBWay.
    - Cota: aceitação do staff lança a venda na CONTA CORRENTE (não fica paga).
    - MBWay normal: regista pagamento (com nº de transação) e abate a dívida."""
    is_quota = mb.get("kind") == "quota"
    result = {}
    if is_quota:
        sale_id = str(uuid.uuid4())
        tx_no = await _next_tx_number()
        mb_client = await db.clients.find_one({"id": mb["client_id"]}, {"_id": 0}) or {}
        mb_unit = _quota_amount(mb_client)
        items = [{
            "product_id": f"quota-{mb['quota_year']}-{m:02d}",
            "product_name": f"Cota {MONTHS_PT[m-1]}/{mb['quota_year']}",
            "unit_price": mb_unit,
            "quantity": 1,
            "subtotal": mb_unit,
        } for m in mb["quota_months"]]
        await db.sales.insert_one({
            "id": sale_id,
            "tx_number": tx_no,
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
        await db.clients.update_one({"id": mb["client_id"]}, {"$inc": {"balance": float(mb["amount"]), "total_spent": float(mb["amount"])}})
        for m in mb["quota_months"]:
            await db.quotas.update_one(
                {"client_id": mb["client_id"], "year": mb["quota_year"], "month": m},
                {"$set": {
                    "client_id": mb["client_id"], "year": mb["quota_year"], "month": m,
                    "status": "billed",
                    "amount": mb_unit,
                    "billed_at": datetime.now(timezone.utc).isoformat(),
                    "sale_id": sale_id,
                    "user_email": user["email"],
                }, "$unset": {"reversed": ""}},
                upsert=True,
            )
        result = {"sale_id": sale_id, "sale_tx_number": tx_no}
    else:
        pid = str(uuid.uuid4())
        tx_no = await _next_tx_number()
        pts = int(mb.get("points_used") or 0)
        pts_value = round(pts / POINTS_PER_EURO, 2)
        credited = round(float(mb["amount"]) + pts_value, 2)
        pay = {
            "id": pid,
            "tx_number": tx_no,
            "client_id": mb["client_id"],
            "client_name": mb["client_name"],
            "amount": float(mb["amount"]),
            "tendered": float(mb["amount"]),
            "total_credited": credited,
            "change_returned": 0.0,
            "points_used": pts,
            "points_value": pts_value,
            "note": f"MBWay {mb['mbway_phone']}" + (f" · {mb['note']}" if mb.get("note") else "") + (f" · {pts} pts" if pts else ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "user_email": user["email"],
            "source": "mbway",
            "mbway_id": mb["id"],
        }
        await db.payments.insert_one(pay)
        await db.clients.update_one(
            {"id": mb["client_id"]},
            {"$inc": {"balance": -credited, **({"points": -pts} if pts else {})}},
        )
        if pts:
            await _log_points(mb["client_id"], -pts, "mbway", mb["id"], f"Desconto de pontos em pagamento MBWay ({pts_value:.2f} €)", user["email"])
        await _sync_quota_paid_status(mb["client_id"])
        result = {"payment_id": pid, "payment_tx_number": tx_no}
    return result

async def _revert_mbway_confirm(mb: dict, user: dict):
    """Estorna o movimento financeiro de um pedido MBWay confirmado (mudança de estado).
    Devolve crédito ao cliente em conta corrente."""
    is_quota = mb.get("kind") == "quota"
    if is_quota:
        sale_id = mb.get("sale_id")
        sale = await db.sales.find_one({"id": sale_id}, {"_id": 0}) if sale_id else None
        if sale:
            # reverter conta corrente e eliminar a venda de cota
            await db.clients.update_one({"id": mb["client_id"]}, {"$inc": {"balance": -float(sale.get("total", 0)), "total_spent": -float(sale.get("total", 0))}})
            await db.sales.delete_one({"id": sale_id})
            year, months = _quota_months_from_sale(sale)
            if year and months:
                for m in months:
                    await db.quotas.update_one(
                        {"client_id": mb["client_id"], "year": year, "month": m},
                        {"$set": {"status": "open"}, "$unset": {"sale_id": "", "reversed": ""}},
                    )
            await _audit("mbway_quota_revert", user["email"], entity="mbway", entity_id=mb["id"], summary=f"Venda de cotas #{sale.get('tx_number', '—')} revertida · {mb.get('client_name', '—')}")
    else:
        pay_id = mb.get("payment_id")
        pay = await db.payments.find_one({"id": pay_id}, {"_id": 0}) if pay_id else None
        if pay:
            credited = float(pay.get("total_credited", pay.get("amount", 0)))
            await db.clients.update_one({"id": mb["client_id"]}, {"$inc": {"balance": credited}})
            await db.payments.delete_one({"id": pay_id})
            await _sync_quota_paid_status(mb["client_id"])
            await _audit("mbway_payment_revert", user["email"], entity="mbway", entity_id=mb["id"], summary=f"Pagamento MBWay #{pay.get('tx_number', '—')} estornado · crédito de {credited:.2f} € a {mb.get('client_name', '—')}")
        else:
            # pagamento antigo sem payment_id — procura por mbway_id
            old = await db.payments.find_one_and_delete({"mbway_id": mb["id"]}, {"_id": 0})
            if old:
                credited = float(old.get("total_credited", old.get("amount", 0)))
                await db.clients.update_one({"id": mb["client_id"]}, {"$inc": {"balance": credited}})
                await _sync_quota_paid_status(mb["client_id"])

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
    result = await _apply_mbway_confirm(mb, user)
    await db.mbway_payments.update_one(
        {"id": mb_id},
        {"$set": {"status": "confirmed", "confirmed_at": datetime.now(timezone.utc).isoformat(), "confirmed_by": user["email"], **result}},
    )
    await _audit("mbway_confirm", user["email"], entity="mbway", entity_id=mb_id, summary=f"MBWay confirmado · {mb.get('client_name', '—')} · {float(mb['amount']):.2f} €")
    return {"ok": True, **result}

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
    await _audit("mbway_reject", user["email"], entity="mbway", entity_id=mb_id, summary=f"MBWay rejeitado · {mb.get('client_name', '—')} · {float(mb['amount']):.2f} €")
    return {"ok": True}

class MBWayStatusIn(BaseModel):
    status: str  # pending | confirmed | rejected

@api_router.put("/mbway-payments/{mb_id}/status")
async def set_mbway_payment_status(mb_id: str, body: MBWayStatusIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    """Edita o estado de um pedido MBWay (Pendente / Confirmado / Rejeitado).
    Mudar de 'confirmado' para outro estado ESTORNA o movimento na conta corrente
    (gera crédito ao cliente). Reconfirmar aplica o movimento de novo."""
    mb = await db.mbway_payments.find_one({"id": mb_id}, {"_id": 0})
    if not mb:
        raise HTTPException(status_code=404, detail="Pedido MBWay não encontrado")
    if body.status not in ("pending", "confirmed", "rejected"):
        raise HTTPException(status_code=400, detail="Estado inválido")
    if body.status == mb["status"]:
        raise HTTPException(status_code=400, detail="O pedido já está nesse estado")
    if mb["status"] == "confirmed":
        # estorna o movimento financeiro antes de mudar de estado
        await _revert_mbway_confirm(mb, user)
    result = {}
    if body.status == "confirmed":
        result = await _apply_mbway_confirm(mb, user)
    await db.mbway_payments.update_one(
        {"id": mb_id},
        {"$set": {"status": body.status, "confirmed_at": datetime.now(timezone.utc).isoformat() if body.status != "pending" else None, "confirmed_by": user["email"], **result}},
    )
    await _audit("mbway_status_change", user["email"], entity="mbway", entity_id=mb_id,
                 summary=f"Estado MBWay alterado {mb['status']} → {body.status} · {mb.get('client_name', '—')} · {float(mb['amount']):.2f} €"
                 + (" · movimento estornado (crédito ao cliente)" if mb["status"] == "confirmed" else ""))
    return {"ok": True, "status": body.status, **result}

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
async def create_supplier(body: SupplierIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    sid = str(uuid.uuid4())
    # Próximo código sequencial F01, F02...
    code = await _next_supplier_code()
    doc = {
        "id": sid,
        "code": code,
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


async def _next_supplier_code() -> str:
    from pymongo import ReturnDocument
    res = await db.counters.find_one_and_update(
        {"_id": "supplier_code"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER,
    )
    seq = int(res["seq"]) if res else 1
    return f"F{seq:02d}"

@api_router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, body: SupplierUpdate, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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
async def create_supplier_order(body: SupplierOrderIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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
    movement = None
    if paid:
        # Encomenda já paga no ato — exige método + nº da nota de pagamento
        movement = await _record_expense_payment(
            amount=total, payment_source=body.payment_source or "caixa", payment_ref=body.payment_ref or "",
            supplier_id=body.supplier_id, supplier_name=sup["name"],
            entity="supplier_order", entity_id=oid, user=user,
            note=f"Encomenda paga no registo {body.invoice_ref or ''}".strip() or None,
        )
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
        "payment_source": movement["payment_source"] if movement else None,
        "payment_ref": movement["payment_ref"] if movement else None,
        "payments": [{
            "amount": round(total, 2), "payment_source": movement["payment_source"],
            "payment_ref": movement["payment_ref"], "paid_at": movement["created_at"],
            "user_email": user["email"],
        }] if movement else [],
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


@api_router.post("/supplier-orders/auto")
async def auto_supplier_orders(user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    """Encomenda automática por stock baixo — critérios já definidos:
    · produto com quantity <= low_stock_threshold (e não-cota, disponível);
    · quantidade a encomendar = 2× o limiar de alerta − stock atual (mínimo 1);
    · custo unitário = o da última encomenda do produto; sem histórico, o preço de venda;
    · agrupa tudo num encomenda por fornecedor do produto (supplier_id da ficha de produto).
    Devolve as encomendas criadas (uma por fornecedor) e produtos sem fornecedor."""
    prods = await db.products.find({"is_quota": {"$ne": True}}, {"_id": 0}).to_list(500)
    low = [p for p in prods if not p.get("unavailable") and int(p.get("quantity", 0) or 0) <= int(p.get("low_stock_threshold", 5) or 0)]
    by_supplier: dict = {}
    no_supplier: list = []
    for p in low:
        sid = p.get("supplier_id")
        if not sid:
            no_supplier.append(p["name"])
            continue
        last = await db.supplier_orders.find_one(
            {"items.product_id": p["id"]}, {"_id": 0, "items": {"$elemMatch": {"product_id": p["id"]}}, "created_at": 1},
            sort=[("created_at", -1)],
        )
        unit = None
        try:
            unit = (last or {}).get("items", [{}])[0].get("unit_cost")
        except (IndexError, AttributeError):
            unit = None
        if not unit:
            unit = float(p.get("price", 0) or 0)
        qty = max(int(p.get("low_stock_threshold", 5) or 5) * 2 - int(p.get("quantity", 0) or 0), 1)
        by_supplier.setdefault(sid, []).append({
            "product_id": p["id"], "product_name": p["name"],
            "quantity": qty, "unit_cost": round(float(unit), 2),
        })
    created = []
    for sid, items in by_supplier.items():
        try:
            doc = await create_supplier_order(
                SupplierOrderIn(supplier_id=sid, items=[SupplierOrderItemIn(**it) for it in items],
                                paid=False, note="Encomenda automática · stock baixo"),
                user,
            )
            created.append({"supplier_id": sid, "supplier_name": doc["supplier_name"], "id": doc["id"], "total": doc["total"], "items": len(items)})
        except HTTPException:
            no_supplier.extend(it["product_name"] for it in items)
    await _audit("supplier_order_auto", user["email"], summary=f"Encomendas automáticas de stock baixo: {len(created)} encomenda(s)" + (f" · sem fornecedor: {', '.join(no_supplier[:5])}" if no_supplier else ""))
    return {"created": created, "no_supplier": no_supplier}

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
async def pay_supplier_order(order_id: str, body: SupplierOrderPay, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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
    # Pagamento sai da CAIXA ou do BANCO — desconta do saldo respetivo e fica
    # registado com o nº da nota de pagamento
    movement = await _record_expense_payment(
        amount=body.amount, payment_source=body.payment_source, payment_ref=body.payment_ref,
        supplier_id=o.get("supplier_id"), supplier_name=o.get("supplier_name"),
        entity="supplier_order", entity_id=order_id, user=user,
        note=body.note or f"Pagamento de encomenda {o.get('tx_number') or order_id}",
    )
    payments_log = list(o.get("payments") or [])
    payments_log.append({
        "amount": round(float(body.amount), 2),
        "payment_source": movement["payment_source"],
        "payment_ref": movement["payment_ref"],
        "paid_at": movement["created_at"],
        "user_email": user["email"],
    })
    await db.supplier_orders.update_one(
        {"id": order_id},
        {"$set": {
            "amount_paid": new_paid_total,
            "balance_due": max(total - new_paid_total, 0),
            "paid": fully,
            "payment_source": movement["payment_source"],
            "payment_ref": movement["payment_ref"],
            "payments": payments_log,
            "last_payment_at": movement["created_at"],
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
async def create_supplier_expense(body: SupplierExpenseIn, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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
        "invoice_no": body.invoice_no,
        "amount": float(body.amount),
        "due_date": body.due_date,
        "paid": bool(body.paid),
        "paid_at": body.paid_at if body.paid else None,
        "payment_source": (body.payment_source or "").strip().lower() or None,
        "payment_ref": (body.payment_ref or "").strip() or None,
        "recurring": body.recurring,
        "note": body.note,
        "attachment_name": body.attachment_name,
        "attachment_data": body.attachment_data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if doc["paid"]:
        # Despesa já paga no ato — exige método + nº da nota de pagamento
        movement = await _record_expense_payment(
            amount=float(body.amount), payment_source=body.payment_source or "caixa",
            payment_ref=body.payment_ref or "",
            supplier_id=body.supplier_id, supplier_name=sup_name,
            entity="supplier_expense", entity_id=eid, user=user,
            note=body.description,
        )
        doc["payment_source"] = movement["payment_source"]
        doc["payment_ref"] = movement["payment_ref"]
        if not doc["paid_at"]:
            doc["paid_at"] = movement["created_at"]
    await db.supplier_expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/supplier-expenses/{expense_id}")
async def update_supplier_expense(expense_id: str, body: SupplierExpenseUpdate, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
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

@api_router.post("/supplier-expenses/{expense_id}/pay")
async def pay_supplier_expense(expense_id: str, body: SupplierExpensePay, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    """Marca a despesa como paga indicando método (caixa/banco) e o nº da
    nota de pagamento — desconta o valor do saldo respetivo."""
    e = await db.supplier_expenses.find_one({"id": expense_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    if e.get("paid"):
        raise HTTPException(status_code=400, detail="Despesa já está paga")
    now_iso = datetime.now(timezone.utc).isoformat()
    movement = await _record_expense_payment(
        amount=float(e["amount"]), payment_source=body.payment_source, payment_ref=body.payment_ref,
        supplier_id=e.get("supplier_id"), supplier_name=e.get("supplier_name"),
        entity="supplier_expense", entity_id=expense_id, user=user,
        note=e.get("description"),
    )
    await db.supplier_expenses.update_one(
        {"id": expense_id},
        {"$set": {
            "paid": True,
            "paid_at": now_iso,
            "payment_source": movement["payment_source"],
            "payment_ref": movement["payment_ref"],
        }},
    )
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
    # Pedidos prontos a levantar e não recolhidos são anulados 10 min após a leitura
    asyncio.create_task(_pickup_autocancel_loop())

    # seed users (admin + tesoureiro + 3 funcionários)
    seed_list = [
        {"email": os.environ.get("ADMIN_EMAIL", "admin@ard.pt").lower(),
         "password": os.environ.get("ADMIN_PASSWORD", "admin123"),
         "name": "David Vicente", "role": "admin"},  # Administrador 1
        {"email": "admin2@ard.pt", "password": "admin2x123",
         "name": "Vitor Cruz", "role": "admin"},  # Administrador 2
        {"email": "presidente@ard.pt", "password": "presidente123",
         "name": "Armando Almeida", "role": "presidente"},  # Presidente da Assembleia (funções = tesoureiro)
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
            if existing.get("name") != u["name"]:
                updates["name"] = u["name"]
            if updates:
                await db.users.update_one({"email": u["email"]}, {"$set": updates})

    # Arquivo oficial do clube (história, palmarés e fontes) — só semeia se estiver vazio
    await _seed_club_archive_history()

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

    # PIN visível na ficha: SÓ quando o sócio alterou o PIN automático (pin_history).
    # PINs originais/automáticos derivados do nº de sócio NÃO ficam visíveis.
    latest_pin = {}
    async for h in db.pin_history.find({}, {"_id": 0, "client_id": 1, "new_pin": 1, "changed_at": 1}).sort("changed_at", 1):
        if h.get("client_id") and h.get("new_pin"):
            latest_pin[h["client_id"]] = h["new_pin"]
    pin_visible_count = 0
    async for c in db.clients.find({"pin_hash": {"$ne": None}, "$or": [{"pin_visible": {"$exists": False}}, {"pin_visible": None}]}, {"_id": 0, "id": 1, "member_number": 1}):
        plain = latest_pin.get(c["id"])
        auto = auto_pin_from_member_number(c.get("member_number"))
        if plain and (not auto or plain != auto):
            await db.clients.update_one({"id": c["id"]}, {"$set": {"pin_visible": plain}})
            pin_visible_count += 1
    if pin_visible_count:
        logging.getLogger(__name__).info(f"pin_visible preenchido para {pin_visible_count} sócios")
    # Limpeza de dados legados: esconder PINs iguais ao automático (não alterados pelo sócio)
    legacy_cleared = 0
    async for c in db.clients.find({"pin_visible": {"$ne": None}}, {"_id": 0, "id": 1, "member_number": 1, "pin_visible": 1}):
        auto = auto_pin_from_member_number(c.get("member_number"))
        if auto and c.get("pin_visible") == auto:
            await db.clients.update_one({"id": c["id"]}, {"$set": {"pin_visible": None}})
            legacy_cleared += 1
    if legacy_cleared:
        logging.getLogger(__name__).info(f"pin_visible limpo (PIN automático original) para {legacy_cleared} sócios")

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

    # Backfill campos em pagamentos antigos (amount, tendered, total_credited, points_used)
    pay_fix = 0
    async for p in db.payments.find({"$or": [{"amount": {"$exists": False}}, {"total_credited": {"$exists": False}}, {"tendered": {"$exists": False}}]}, {"_id": 0}):
        upd = {}
        existing_amount = p.get("amount")
        existing_total = p.get("total_credited")
        existing_tendered = p.get("tendered")
        # Resolver amount: usa total_credited se existir, ou 0 como último recurso
        base = existing_amount if existing_amount is not None else (existing_total if existing_total is not None else 0.0)
        change = float(p.get("change_returned") or 0)
        if existing_amount is None:
            upd["amount"] = float(base)
        if existing_total is None:
            upd["total_credited"] = float(base)
        if existing_tendered is None:
            upd["tendered"] = float(base) + change
        if "points_used" not in p:
            upd["points_used"] = 0
        if "points_value" not in p:
            upd["points_value"] = 0.0
        if upd:
            await db.payments.update_one({"id": p["id"]}, {"$set": upd})
            pay_fix += 1
    if pay_fix:
        logging.getLogger(__name__).info(f"Backfill pagamentos: {pay_fix} docs preenchidos com amount/total_credited/tendered/points")

    # Backfill fornecedores com código F01...
    counter_doc = await db.counters.find_one({"_id": "supplier_code"})
    seq = int(counter_doc["seq"]) if counter_doc else 0
    sup_fix = 0
    async for s in db.suppliers.find({"$or": [{"code": {"$exists": False}}, {"code": None}]}, {"_id": 0}).sort("created_at", 1):
        if s.get("id") == "_house":
            await db.suppliers.update_one({"id": s["id"]}, {"$set": {"code": "F00"}})
            continue
        seq += 1
        await db.suppliers.update_one({"id": s["id"]}, {"$set": {"code": f"F{seq:02d}"}})
        sup_fix += 1
    if sup_fix:
        await db.counters.update_one({"_id": "supplier_code"}, {"$set": {"seq": seq}}, upsert=True)
        logging.getLogger(__name__).info(f"Backfill fornecedores: {sup_fix} códigos F atribuídos")

    # Backfill retiradas de caixa antigas sem campo kind — o fluxo original
    # era sempre transferência de caixa para o banco (depósito).
    wd_fix = 0
    async for w in db.cash_withdrawals.find({"kind": {"$exists": False}}, {"_id": 0, "id": 1}):
        await db.cash_withdrawals.update_one({"id": w["id"]}, {"$set": {"kind": "bank_deposit"}})
        wd_fix += 1
    if wd_fix:
        logging.getLogger(__name__).info(f"Backfill cash_withdrawals: {wd_fix} retiradas antigas classificadas como depósito bancário")

    # Backfill preço de custo — por omissão 12% abaixo do preço de venda (editável)
    cost_fix = 0
    async for p in db.products.find({"$or": [{"cost_price": {"$exists": False}}, {"cost_price": None}]}, {"_id": 0, "id": 1, "price": 1}):
        await db.products.update_one({"id": p["id"]}, {"$set": {"cost_price": round(float(p.get("price", 0) or 0) * 0.88, 2)}})
        cost_fix += 1
    if cost_fix:
        logging.getLogger(__name__).info(f"Backfill preço de custo: {cost_fix} produtos (12% abaixo do preço de venda)")

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

# ---------- Fecho de caixa cego + estado do bar ----------
def _payment_cash_value(p: dict) -> float:
    """Valor em dinheiro de um pagamento (para o fecho de caixa).
    MBWay e pontos não contam; gratificação (tip) fica na gaveta.
    Devoluções de crédito NÃO contam como entrada de caixa — saem pela
    movimentação própria em cash_withdrawals (kind credit_refund)."""
    src = (p.get("source") or "").lower()
    if "mbway" in src:
        return 0.0
    if src == "refund":
        return 0.0
    credited = float(p.get("total_credited", p.get("amount", 0)) or 0)
    pts = float(p.get("points_value", 0) or 0)
    tip = float(p.get("tip", 0) or 0)
    # A oferta da casa é despesa do bar — nunca entra no saldo final em caixa
    offer = float(p.get("offer_amount", 0) or 0)
    return max(credited - pts - offer + tip, 0.0)

async def _live_cash_in_drawer(doc: dict) -> float:
    """Valor em caixa da sessão atual: valor declarado na abertura + entradas em
    numerário desde então (as saídas já são subtraídas ao próprio cash_in_drawer)."""
    base = round(float(doc.get("cash_in_drawer") or 0), 2)
    since = doc.get("changed_at")
    if not since:
        return base
    payments = await db.payments.find({"created_at": {"$gte": since}}, {"_id": 0}).to_list(5000)
    return round(base + sum(_payment_cash_value(p) for p in payments), 2)


async def _expected_cash_today() -> float:
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    payments = await db.payments.find({"created_at": {"$gte": day_start}}, {"_id": 0}).to_list(5000)
    cash_in = sum(_payment_cash_value(p) for p in payments)
    # Saídas de caixa do dia: depósitos bancários, devoluções de crédito e
    # despesas pagas em caixa. Despesas pagas por BANCO nunca saem da gaveta.
    movements = await db.cash_withdrawals.find({"created_at": {"$gte": day_start}}, {"_id": 0}).to_list(5000)
    cash_out = sum(
        float(m.get("amount", 0)) for m in movements
        if m.get("kind") in ("bank_deposit", "credit_refund", "expense_cash")
    )
    cash_extra_in = sum(
        float(m.get("amount", 0)) for m in movements
        if m.get("kind") == "transfer_bank_cash" or (m.get("kind") == "deposit_in" and m.get("target") == "caixa")
    )
    return round(max(cash_in + cash_extra_in - cash_out, 0.0), 2)


async def _account_balances() -> dict:
    """Saldos contabilísticos de caixa e banco (todas as datas).
    Caixa = entradas em numerário + depósitos externos em caixa + transferências
    banco→caixa − depósitos bancários − devoluções de crédito − despesas pagas em caixa.
    Banco = depósitos + depósitos externos em banco − transferências banco→caixa
    − despesas pagas por banco. Transferências entre caixa e banco NÃO são
    receita nem despesa."""
    cash_payments = await db.payments.find({"source": {"$ne": "refund"}}, {"_id": 0}).to_list(50000)
    cash_in = round(sum(_payment_cash_value(p) for p in cash_payments), 2)
    wd_all = await db.cash_withdrawals.find({}, {"_id": 0}).to_list(50000)
    deposits = round(sum(float(w.get("amount", 0)) for w in wd_all if w.get("kind") == "bank_deposit"), 2)
    refunds = round(sum(float(w.get("amount", 0)) for w in wd_all if w.get("kind") == "credit_refund"), 2)
    exp_cash = round(sum(float(w.get("amount", 0)) for w in wd_all if w.get("kind") == "expense_cash"), 2)
    exp_bank = round(sum(float(w.get("amount", 0)) for w in wd_all if w.get("kind") == "expense_bank"), 2)
    dep_in_cash = round(sum(float(w.get("amount", 0)) for w in wd_all if w.get("kind") == "deposit_in" and w.get("target") == "caixa"), 2)
    dep_in_bank = round(sum(float(w.get("amount", 0)) for w in wd_all if w.get("kind") == "deposit_in" and w.get("target") == "banco"), 2)
    bank_to_cash = round(sum(float(w.get("amount", 0)) for w in wd_all if w.get("kind") == "transfer_bank_cash"), 2)
    bank_balance = round(deposits + dep_in_bank - bank_to_cash - exp_bank, 2)
    cash_balance = round(cash_in + dep_in_cash + bank_to_cash - deposits - refunds - exp_cash, 2)
    return {
        "cash_balance": cash_balance,
        "bank_balance": bank_balance,
        "total_balance": round(bank_balance + cash_balance, 2),
    }


# ---------- Depósitos de valores (donativos/subsídios/etc.) e transferências ----------
DEPOSIT_CATEGORIES = ["donativos", "subsidios", "excedente", "outras_atividades", "outros"]


class BankDepositIn(BaseModel):
    category: str  # donativos | subsidios | excedente | outras_atividades | outros
    amount: float
    target: str  # caixa | banco
    reason: str  # motivo detalhado — obrigatório


class BankTransferIn(BaseModel):
    direction: str  # bank_to_cash | cash_to_bank
    amount: float
    reason: str  # motivo detalhado — obrigatório


@api_router.post("/bank/deposits")
async def create_bank_deposit(body: BankDepositIn, user: dict = Depends(require_role("admin", "tesoureiro"))):
    """Depósito de valores externos: donativos, subsídios, excedente, outras atividades.
    Define se credita em Caixa ou em Banco, com motivo obrigatório."""
    cat = (body.category or "").strip().lower()
    if cat not in DEPOSIT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria inválida")
    target = (body.target or "").strip().lower()
    if target not in ("caixa", "banco"):
        raise HTTPException(status_code=400, detail="Indica se é para caixa ou banco")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Descreve o motivo do depósito")
    tx_no = await _next_tx_number()
    doc = {
        "id": str(uuid.uuid4()),
        "tx_number": tx_no,
        "kind": "deposit_in",
        "category": cat,
        "target": target,
        "amount": round(float(body.amount), 2),
        "note": reason[:500],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "user_role": user.get("role"),
    }
    await db.cash_withdrawals.insert_one(doc)
    if target == "caixa":
        await db.club_state.update_one({"_id": "bar"}, {"$inc": {"cash_in_drawer": float(body.amount)}})
    cat_label = {"donativos": "Donativos", "subsidios": "Subsídios", "excedente": "Excedente",
                 "outras_atividades": "Outras atividades", "outros": "Outros"}[cat]
    await _audit("bank_deposit_in", user["email"], entity="cash_withdrawal", entity_id=doc["id"], tx_number=tx_no,
                 summary=f"Depósito #{tx_no} · {cat_label} · {euro_fmt(body.amount)} creditado em {target} · {reason}")
    doc.pop("_id", None)
    return doc


@api_router.get("/bank/deposits")
async def list_bank_deposits(user: dict = Depends(get_current_user)):
    items = await db.cash_withdrawals.find({"kind": "deposit_in"}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.post("/bank/transfers")
async def create_bank_transfer(body: BankTransferIn, user: dict = Depends(require_role("admin", "tesoureiro"))):
    """Transferência de valores entre banco e caixa (ou vice-versa).
    Não é despesa nem receita — apenas movimentação de valores."""
    direction = (body.direction or "").strip().lower()
    if direction not in ("bank_to_cash", "cash_to_bank"):
        raise HTTPException(status_code=400, detail="Direção inválida")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Descreve o motivo da transferência")
    tx_no = await _next_tx_number()
    kind = "transfer_bank_cash" if direction == "bank_to_cash" else "bank_deposit"
    doc = {
        "id": str(uuid.uuid4()),
        "tx_number": tx_no,
        "kind": kind,
        "amount": round(float(body.amount), 2),
        "note": reason[:500],
        "deposit_note": reason[:300],
        "deposit_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "user_role": user.get("role"),
    }
    await db.cash_withdrawals.insert_one(doc)
    if direction == "bank_to_cash":
        await db.club_state.update_one({"_id": "bar"}, {"$inc": {"cash_in_drawer": float(body.amount)}})
    else:
        await db.club_state.update_one({"_id": "bar"}, {"$inc": {"cash_in_drawer": -float(body.amount)}})
    label = "Banco → Caixa" if direction == "bank_to_cash" else "Caixa → Banco"
    await _audit("bank_transfer", user["email"], entity="cash_withdrawal", entity_id=doc["id"], tx_number=tx_no,
                 summary=f"Transferência #{tx_no} · {label} · {euro_fmt(body.amount)} · {reason} · não é receita nem despesa")
    doc.pop("_id", None)
    return doc


@api_router.get("/bank/transfers")
async def list_bank_transfers(user: dict = Depends(get_current_user)):
    items = await db.cash_withdrawals.find({"kind": {"$in": ["transfer_bank_cash", "bank_deposit"]}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.get("/treasury/movements")
async def treasury_movements(account: str = "cash", date_from: Optional[str] = None, date_to: Optional[str] = None,
                             user: dict = Depends(get_current_user)):
    """Movimentos detalhados de caixa ou banco (para consulta e impressão)."""
    acc = (account or "cash").strip().lower()
    if acc not in ("cash", "cash", "caixa", "bank", "banco"):
        raise HTTPException(status_code=400, detail="Conta inválida")
    is_cash = acc in ("cash", "caixa")
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    rng = {}
    if dfrom:
        rng["$gte"] = dfrom
    if dto:
        rng["$lte"] = dto
    q = {"created_at": rng} if rng else {}
    movements = []
    if is_cash:
        async for p in db.payments.find({**q, "source": {"$ne": "refund"}}, {"_id": 0}):
            val = _payment_cash_value(p)
            if val <= 0:
                continue
            movements.append({
                "id": p["id"], "tx_number": p.get("tx_number"), "date": p.get("created_at"),
                "description": f"Pagamento de {p.get('client_name', '')} (numerário)",
                "detail": p.get("note"), "direction": "in", "amount": round(val, 2),
            })
        async for w in db.cash_withdrawals.find(q, {"_id": 0}):
            kind = w.get("kind")
            amt = float(w.get("amount", 0))
            desc = {
                "bank_deposit": "Depósito para o banco",
                "credit_refund": "Devolução de crédito",
                "expense_cash": "Despesa paga em caixa",
                "deposit_in": f"Depósito · {w.get('category', '')}",
                "transfer_bank_cash": "Transferência Banco → Caixa",
            }.get(kind, "Movimento de caixa")
            direction = "in" if kind in ("deposit_in", "transfer_bank_cash") else "out"
            movements.append({
                "id": w["id"], "tx_number": w.get("tx_number"), "date": w.get("created_at"),
                "description": desc, "detail": w.get("note") or w.get("deposit_note"),
                "direction": direction, "amount": round(amt, 2),
            })
    else:
        async for w in db.cash_withdrawals.find(q, {"_id": 0}):
            kind = w.get("kind")
            amt = float(w.get("amount", 0))
            if kind in ("bank_deposit", "deposit_in", "transfer_bank_cash", "expense_bank"):
                if kind == "bank_deposit":
                    direction, desc = "in", "Depósito de caixa"
                elif kind == "deposit_in":
                    if w.get("target") != "banco":
                        continue
                    direction, desc = "in", f"Depósito · {w.get('category', '')}"
                elif kind == "transfer_bank_cash":
                    direction, desc = "out", "Transferência Banco → Caixa"
                else:
                    direction, desc = "out", "Despesa paga por banco"
                movements.append({
                    "id": w["id"], "tx_number": w.get("tx_number"), "date": w.get("created_at"),
                    "description": desc, "detail": w.get("note") or w.get("deposit_note"),
                    "direction": direction, "amount": round(amt, 2),
                })
    movements.sort(key=lambda m: m.get("date") or "", reverse=True)
    balances = await _account_balances()
    return {
        "account": "bank" if not is_cash else "cash",
        "label": "Banco" if not is_cash else "Caixa",
        "balance": balances["bank_balance"] if not is_cash else balances["cash_balance"],
        "movements": movements,
        "total_in": round(sum(m["amount"] for m in movements if m["direction"] == "in"), 2),
        "total_out": round(sum(m["amount"] for m in movements if m["direction"] == "out"), 2),
    }


async def _record_expense_payment(
    *, amount: float, payment_source: str, payment_ref: str,
    supplier_id: Optional[str] = None, supplier_name: Optional[str] = None,
    entity: str, entity_id: Optional[str], user: dict, note: Optional[str] = None,
) -> dict:
    """Regista o pagamento de uma despesa a fornecedor: sai da CAIXA (kind
    expense_cash, reduz a gaveta) ou do BANCO (kind expense_bank, reduz o
    saldo bancário). Guarda o nº da nota de pagamento."""
    source = (payment_source or "").strip().lower()
    if source not in ("caixa", "banco"):
        raise HTTPException(status_code=400, detail="Método de pagamento deve ser 'caixa' ou 'banco'")
    ref = (payment_ref or "").strip()
    if not ref:
        raise HTTPException(status_code=400, detail="O nº da nota de pagamento é obrigatório")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Valor de pagamento inválido")
    kind = "expense_cash" if source == "caixa" else "expense_bank"
    doc = {
        "id": str(uuid.uuid4()),
        "tx_number": await _next_tx_number(),
        "kind": kind,
        "amount": round(float(amount), 2),
        "payment_ref": ref[:100],
        "payment_source": source,
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "entity": entity,
        "entity_id": entity_id,
        "note": note,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "user_role": user.get("role"),
    }
    await db.cash_withdrawals.insert_one(doc)
    if kind == "expense_cash":
        await db.club_state.update_one({"_id": "bar"}, {"$inc": {"cash_in_drawer": -float(amount)}})
    await _audit(
        "expense_payment", user["email"], entity=entity, entity_id=entity_id,
        summary=f"Despesa paga em {source} · {euro_fmt(float(amount))} · nota {ref}" + (f" · {supplier_name}" if supplier_name else ""),
    )
    return doc

class CashCloseIn(BaseModel):
    cash_counted: float  # valor contado na gaveta (fecho cego)
    note: Optional[str] = None

@api_router.post("/cash-close")
async def cash_close(body: CashCloseIn, user: dict = Depends(get_current_user)):
    """Fecho de caixa cego: o funcionário conta o dinheiro SEM saber o esperado."""
    if body.cash_counted < 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    expected = await _expected_cash_today()
    difference = round(float(body.cash_counted) - expected, 2)
    tx_no = await _next_tx_number()
    rec = {
        "id": str(uuid.uuid4()),
        "tx_number": tx_no,
        "cash_counted": round(float(body.cash_counted), 2),
        "expected_cash": expected,
        "difference": difference,
        "note": body.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    await db.cash_closes.insert_one(rec)
    await _audit("cash_close", user["email"], summary=f"Fecho de caixa cego · contado {rec['cash_counted']:.2f} € · esperado {expected:.2f} € · diferença {difference:+.2f} €" + (f" · {body.note}" if body.note else ""))
    rec.pop("_id", None)
    return rec

@api_router.get("/cash-closes")
async def list_cash_closes(date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: dict = {}
    rng = {}
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    if dfrom:
        rng["$gte"] = dfrom
    if dto:
        rng["$lte"] = dto
    if rng:
        q["created_at"] = rng
    items = await db.cash_closes.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

class BarStatusIn(BaseModel):
    open: bool
    cash_declared: Optional[float] = None  # obrigatório ao ABRIR: dinheiro em caixa
    cash_counted: Optional[float] = None   # ao FECHAR: dinheiro contado na gaveta

@api_router.post("/bar-status")
async def set_bar_status(body: BarStatusIn, user: dict = Depends(get_current_user)):
    now_iso = datetime.now(timezone.utc).isoformat()
    # Ao abrir o bar é OBRIGATÓRIO indicar o dinheiro em caixa
    if body.open and body.cash_declared is None:
        raise HTTPException(status_code=400, detail="Indica obrigatoriamente o dinheiro em caixa para abrir o bar")
    if body.open and body.cash_declared is not None and body.cash_declared < 0:
        raise HTTPException(status_code=400, detail="Valor em caixa inválido")
    if not body.open and body.cash_counted is not None and body.cash_counted < 0:
        raise HTTPException(status_code=400, detail="Valor contado em caixa inválido")
    previous = await db.club_state.find_one({"_id": "bar"}, {"_id": 0}) or {}
    if body.open:
        declared = round(float(body.cash_declared), 2)
        doc = {
            "open": True,
            "changed_at": now_iso,
            "changed_by": user["email"],
            "cash_in_drawer": declared,
            "opening_cash_declared": declared,
            "opened_at": now_iso,
            "opened_by": user["email"],
        }
        await db.club_state.find_one_and_replace({"_id": "bar"}, {"_id": "bar", **doc}, upsert=True)
        await _audit("bar_open", user["email"],
                     summary=f"Bar ABERTO · dinheiro em caixa ao abrir: {declared:.2f} € (inserido por {user['email']}) · fecho automático às 02:00")
        return doc
    # Fechar: registar o valor contado e comparar com o esperado
    expected = (
        await _live_cash_in_drawer(previous)
        if previous.get("open")
        else await _expected_cash_today()
    )
    if body.cash_counted is None:
        expected = await _expected_cash_today()
    counted = round(float(body.cash_counted), 2) if body.cash_counted is not None else expected
    difference = round(counted - expected, 2)
    doc = {
        "open": False,
        "changed_at": now_iso,
        "changed_by": user["email"],
        "cash_in_drawer": counted,
        "opening_cash_declared": previous.get("opening_cash_declared"),
        "closing_cash_counted": counted,
        "closing_cash_expected": expected,
        "closing_difference": difference,
        "closing_counted_declared": body.cash_counted is not None,
    }
    await db.club_state.find_one_and_replace({"_id": "bar"}, {"_id": "bar", **doc}, upsert=True)
    await _audit("bar_close", user["email"],
                 summary=f"Bar FECHADO · dinheiro contado em caixa: {counted:.2f} € · esperado {expected:.2f} € · diferença {difference:+.2f} €")
    if abs(difference) >= 0.01:
        side = "a mais" if difference > 0 else "a menos"
        await _audit("cash_difference", user["email"],
                     summary=f"⚠ Diferença de caixa no fecho: {abs(difference):.2f} € {side} (contado {counted:.2f} € · esperado {expected:.2f} €) — verificar")
    return doc

@api_router.get("/bar-status")
async def get_bar_status(user: dict = Depends(get_current_user)):
    doc = await db.club_state.find_one({"_id": "bar"}, {"_id": 0})
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    # Fecho automático: se o bar estiver aberto entre as 02:00 e as 05:00 (hora de Lisboa), fecha e registra na ata
    auto_closed = False
    if doc and doc.get("open") and 2 <= now.hour < 5:
        expected = round(float(doc.get("cash_in_drawer") or 0), 2) or await _expected_cash_today()
        opening = doc.get("opening_cash_declared")
        doc = {
            "open": False,
            "changed_at": now.isoformat(),
            "changed_by": "auto",
            "cash_in_drawer": expected,
            "opening_cash_declared": opening,
            "closing_cash_expected": expected,
            "closing_cash_counted": None,
            "closing_counted_declared": False,
        }
        await db.club_state.find_one_and_replace({"_id": "bar"}, {"_id": "bar", **doc}, upsert=True)
        await _audit(
            "bar_auto_close", user["email"],
            summary=f"Bar FECHADO automaticamente às 02:00 · dinheiro em caixa esperado: {expected:.2f} €"
                    + (f" · aberto com {float(opening):.2f} €" if opening is not None else "")
                    + " · fecho não contado (por conferir)",
        )
        auto_closed = True
    state = await _bar_state()
    is_open = bool(doc and doc.get("open")) and state["open"]
    # Durante a sessão o valor da gaveta = abertura + entradas em numerário
    cash = await _live_cash_in_drawer(doc) if is_open else await _expected_cash_today()
    # Nota do último fecho de caixa — mostra ao abrir o bar qual era o valor em caixa
    last_close = await db.cash_closes.find({}, {"_id": 0}).sort("created_at", -1).to_list(1)
    return {
        "open": is_open,
        "changed_at": doc.get("changed_at") if doc else None,
        "changed_by": doc.get("changed_by") if doc else None,
        "cash_in_drawer": cash,
        "opening_cash_declared": doc.get("opening_cash_declared") if doc else None,
        "closing_cash_counted": doc.get("closing_cash_counted") if doc else None,
        "closing_cash_expected": doc.get("closing_cash_expected") if doc else None,
        "closing_difference": doc.get("closing_difference") if doc else None,
        "auto_closed": auto_closed,
        "closing_soon": state["closing_soon"],
        "minutes_to_close": state["minutes_to_close"],
        "closes_at": "02:00",
        "last_close": last_close[0] if last_close else None,
    }

@api_router.get("/ata/daily")
async def ata_daily(date: Optional[str] = None, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    """Dados para a ata diária (impressão A4)."""
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    if not date:
        date = now.strftime("%Y-%m-%d")
    dfrom, dto = f"{date}T00:00:00", f"{date}T23:59:59"
    sales = await db.sales.find({"created_at": {"$gte": dfrom, "$lte": dto}}, {"_id": 0}).sort("created_at", 1).to_list(5000)
    payments = await db.payments.find({"created_at": {"$gte": dfrom, "$lte": dto}}, {"_id": 0}).sort("created_at", 1).to_list(5000)
    closes = await db.cash_closes.find({"created_at": {"$gte": dfrom, "$lte": dto}}, {"_id": 0}).sort("created_at", 1).to_list(100)
    audits = await db.audit_log.find({"at": {"$gte": dfrom, "$lte": dto}}, {"_id": 0}).sort("at", 1).to_list(2000)
    quota_sales = [s for s in sales if s.get("source") == "quota"]
    return {
        "date": date,
        "club_name": CLUB_NAME,
        "sales": sales,
        "payments": payments,
        "cash_closes": closes,
        "audit": audits,
        "totals": {
            "sales": sum(s.get("total", 0) for s in sales),
            "sales_count": len(sales),
            "quota_billed": sum(s.get("total", 0) for s in quota_sales),
            "payments": sum(float(p.get("total_credited", p.get("amount", 0))) for p in payments),
            "expected_cash": round(sum(_payment_cash_value(p) for p in payments), 2),
        },
        "bar": await db.club_state.find_one({"_id": "bar"}, {"_id": 0}),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

# ---------- Listagem universal de transações numeradas ----------
@api_router.get("/transactions")
async def list_transactions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    kind: Optional[str] = None,  # sale | payment | order | expense | cash_close | cash_withdrawal
    q: Optional[str] = None,
    limit: int = 1000,
    user: dict = Depends(get_current_user),
):
    if user.get("role") == "funcionario":
        date_from, date_to = _clamp_month_range(date_from, date_to)
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    rng = {}
    if dfrom:
        rng["$gte"] = dfrom
    if dto:
        rng["$lte"] = dto
    base_q = {"created_at": rng} if rng else {}
    limit = min(max(limit, 1), 5000)
    out = []
    defs = [
        ("sales", "sale", {"client_name": 1, "total": 1, "source": 1, "items": 1}),
        ("payments", "payment", {"client_name": 1, "total_credited": 1, "amount": 1, "source": 1}),
        ("supplier_orders", "order", {"supplier_name": 1, "total": 1, "invoice_ref": 1}),
        ("supplier_expenses", "expense", {"supplier_name": 1, "description": 1, "invoice_no": 1, "amount": 1}),
        ("cash_closes", "cash_close", {"cash_counted": 1, "expected_cash": 1, "difference": 1}),
        ("cash_withdrawals", "cash_withdrawal", {"amount": 1, "note": 1}),
    ]
    for coll, k, proj in defs:
        if kind and kind != k:
            continue
        proj = {"_id": 0, "id": 1, "tx_number": 1, "created_at": 1, "user_email": 1, **proj}
        async for d in db[coll].find(base_q, proj):
            d["_kind"] = k
            out.append(d)
    # Detalhe das vendas = categoria de consumo (bebida, comida, cotas, snack, …)
    sale_rows = [r for r in out if r["_kind"] == "sale"]
    if sale_rows:
        pids = sorted({it.get("product_id") for r in sale_rows for it in (r.get("items") or []) if it.get("product_id")})
        prods = {p["id"]: p for p in await db.products.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "category": 1}).to_list(len(pids))} if pids else {}
        for r in sale_rows:
            cats = []
            for it in r.get("items") or []:
                pid = it.get("product_id") or ""
                cat = "Cotas" if pid.startswith("quota-") else ((prods.get(pid) or {}).get("category") or "Consumo")
                if cat not in cats:
                    cats.append(cat)
            r["categories"] = cats
    if q:
        needle = q.strip().lower()
        out = [d for d in out if needle in str(d.get("client_name", "")).lower()
               or needle in str(d.get("supplier_name", "")).lower()
               or needle in str(d.get("description", "")).lower()
               or str(d.get("tx_number")) == needle]
    out.sort(key=lambda x: (x.get("tx_number") or 0), reverse=True)
    return out[:limit]


# ---------- Retirada de caixa (admin/tesoureiro) ----------
class CashWithdrawalIn(BaseModel):
    amount: float
    note: Optional[str] = None
    deposit_note: str  # nota de depósito — OBRIGATÓRIA
    deposit_date: str  # data do depósito — OBRIGATÓRIA


@api_router.post("/cash-withdrawals")
async def create_cash_withdrawal(body: CashWithdrawalIn, user: dict = Depends(require_role("admin", "tesoureiro"))):
    """Retira valor em caixa e transfere para o banco (depósito) — fica nas
    transações, no relatório financeiro e reduz o valor em caixa do bar.
    Nota de depósito e data são obrigatórias."""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    deposit_note = (body.deposit_note or "").strip()
    deposit_date = (body.deposit_date or "").strip()
    if not deposit_note:
        raise HTTPException(status_code=400, detail="A nota de depósito é obrigatória")
    if not deposit_date:
        raise HTTPException(status_code=400, detail="A data do depósito é obrigatória")
    tx_no = await _next_tx_number()
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tx_number": tx_no,
        "kind": "bank_deposit",
        "amount": float(body.amount),
        "note": (body.note or "").strip()[:300] or None,
        "deposit_note": deposit_note[:300],
        "deposit_date": deposit_date,
        "created_at": now_iso,
        "user_email": user["email"],
        "user_role": user.get("role"),
    }
    await db.cash_withdrawals.insert_one(doc)
    await db.club_state.update_one({"_id": "bar"}, {"$inc": {"cash_in_drawer": -float(body.amount)}})
    await _audit("cash_withdrawal", user["email"], entity="cash_withdrawal", entity_id=doc["id"], tx_number=tx_no,
                 summary=f"Depósito #{tx_no} · Caixa → Banco · {euro_fmt(body.amount)} · nota {deposit_note} · {deposit_date}")
    doc.pop("_id", None)
    return doc


@api_router.get("/cash-withdrawals")
async def list_cash_withdrawals(date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    dfrom = date_from + "T00:00:00" if (date_from and "T" not in date_from) else date_from
    dto = date_to + "T23:59:59" if (date_to and "T" not in date_to) else date_to
    q = {"created_at": {"$gte": dfrom, "$lte": dto}} if (dfrom and dto) else ({"created_at": {"$gte": dfrom}} if dfrom else ({"created_at": {"$lte": dto}} if dto else {}))
    return await db.cash_withdrawals.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

def _clamp_month_range(date_from: Optional[str], date_to: Optional[str]) -> tuple:
    """Janela máxima de UM MÊS (30 dias) para funcionários — hoje fechado no fim."""
    today = datetime.now(timezone.utc).date()
    earliest = today - timedelta(days=30)
    if not date_to or date_to > today.isoformat():
        date_to = today.isoformat()
    try:
        d = datetime.fromisoformat(date_from).date() if date_from else None
    except ValueError:
        d = None
    if not d or d < earliest:
        d = earliest
    return d.isoformat(), date_to

# ---------- PIN: alteração pelo sócio + histórico visível à administração ----------
class SocioChangePinIn(BaseModel):
    current_pin: str
    new_pin: str

@api_router.post("/socio/change-pin")
async def socio_change_pin(body: SocioChangePinIn, socio: dict = Depends(get_current_socio), request: Request = None):
    current = await db.clients.find_one({"id": socio["id"]}, {"pin_hash": 1}) or {}
    if not verify_password(body.current_pin, current.get("pin_hash") or ""):
        raise HTTPException(status_code=401, detail="PIN atual incorreto")
    new_pin = body.new_pin.strip()
    if not new_pin or not new_pin.isdigit() or not (4 <= len(new_pin) <= 6):
        raise HTTPException(status_code=400, detail="O novo PIN deve ter entre 4 e 6 dígitos")
    if new_pin == body.current_pin.strip():
        raise HTTPException(status_code=400, detail="O novo PIN tem de ser diferente do atual")
    ua = (request.headers.get("user-agent", "") if request else "") or "desconhecido"
    await db.clients.update_one({"id": socio["id"]}, {"$set": {"pin_hash": hash_password(new_pin), "pin_visible": new_pin, "pin_changed_at": datetime.now(timezone.utc).isoformat()}})
    rec = {
        "id": str(uuid.uuid4()),
        "client_id": socio["id"],
        "old_pin": body.current_pin.strip(),
        "new_pin": new_pin,
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "method": "Portal do sócio (auto-serviço)",
        "device": ua[:300],
    }
    await db.pin_history.insert_one(rec)
    await _audit("pin_change", socio.get("name") or socio["id"], entity="client", entity_id=socio["id"], summary=f"Sócio alterou o seu PIN ({rec['method']})")
    return {"ok": True}

@api_router.get("/clients/{client_id}/pin-history")
async def client_pin_history(client_id: str, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    items = await db.pin_history.find({"client_id": client_id}, {"_id": 0}).sort("changed_at", -1).to_list(200)
    return items

# ---------- Proposta de sócio (cliente propõe-se a sócio) ----------
class MembershipApplicationIn(BaseModel):
    morada: Optional[str] = None
    localidade: str
    contact: str
    email: Optional[str] = None
    birthday: Optional[str] = None
    accept_regulations: bool

@api_router.post("/clients/{client_id}/membership-application")
async def create_membership_application(client_id: str, body: MembershipApplicationIn, user: dict = Depends(get_current_user)):
    """Regista a proposta de adesão de um cliente a sócio (assinatura digital com data/hora).
    Fica pendente para a administração aceitar/rejeitar."""
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    if c.get("is_member"):
        raise HTTPException(status_code=400, detail="Este cliente já é sócio")
    if not body.accept_regulations:
        raise HTTPException(status_code=400, detail="É obrigatório aceitar o regulamento interno")
    if not (body.localidade or "").strip() or not (body.contact or "").strip():
        raise HTTPException(status_code=400, detail="Localidade e nº de telemóvel são obrigatórios")
    signed_at = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "client_name": c["name"],
        "name": c["name"],
        "morada": body.morada,
        "localidade": body.localidade.strip(),
        "contact": body.contact.strip(),
        "email": body.email,
        "birthday": body.birthday,
        "accepted_regulations": True,
        "signed_at": signed_at,
        "status": "pending",
        "created_at": signed_at,
        "registered_by": user["email"],
    }
    await db.membership_applications.insert_one(doc)
    await _audit("membership_application", user["email"], entity="client", entity_id=client_id, summary=f"Proposta de sócio registada: {c['name']} · assinatura em {signed_at}")
    doc.pop("_id", None)
    return doc

@api_router.get("/membership-applications")
async def list_membership_applications(status_filter: Optional[str] = None, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    q = {"status": status_filter} if status_filter else {}
    items = await db.membership_applications.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.get("/membership-applications/pending-count")
async def membership_applications_pending_count(user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    """Contador do aviso do cabeçalho: adesões à espera de aprovação da direção."""
    return {"pending": await db.membership_applications.count_documents({"status": "pending"})}

@api_router.delete("/membership-applications/{app_id}")
async def delete_membership_application(app_id: str, user: dict = Depends(require_role("admin"))):
    """Remove um registo de adesão (pedido duplicado ou engano). Não altera o cliente."""
    res = await db.membership_applications.delete_one({"id": app_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    await _audit("membership_application_deleted", user["email"], entity="membership_application",
                 entity_id=app_id, summary="Registo de adesão removido do histórico")
    return {"ok": True}

@api_router.post("/membership-applications/{app_id}/accept")
async def accept_membership_application(app_id: str, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    app_doc = await db.membership_applications.find_one({"id": app_id}, {"_id": 0})
    if not app_doc:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    if app_doc["status"] != "pending":
        raise HTTPException(status_code=400, detail="Proposta já tratada")
    # próximo nº de sócio = maior nº numérico existente + 1
    members = await db.clients.find({"is_member": True, "member_number": {"$exists": True, "$ne": None}}, {"_id": 0, "member_number": 1}).to_list(5000)
    nums = []
    for m in members:
        try:
            nums.append(int(str(m["member_number"]).strip()))
        except ValueError:
            continue
    next_no = (max(nums) + 1) if nums else 1
    mn = str(next_no)
    updates = {
        "is_member": True,
        "member_number": mn,
        "morada": app_doc.get("morada") or None,
        "localidade": app_doc.get("localidade"),
        "contact": app_doc.get("contact"),
        "email": app_doc.get("email") or None,
        "birthday": app_doc.get("birthday") or None,
    }
    await db.clients.update_one({"id": app_doc["client_id"]}, {"$set": {k: v for k, v in updates.items() if v is not None}})
    # PIN automático a partir do novo nº de sócio
    auto = auto_pin_from_member_number(mn)
    if auto:
        await db.clients.update_one({"id": app_doc["client_id"]}, {"$set": {"pin_hash": hash_password(auto)}})
    await db.membership_applications.update_one({"id": app_id}, {"$set": {"status": "accepted", "decided_at": datetime.now(timezone.utc).isoformat(), "decided_by": user["email"], "member_number": mn}})
    # Menor de 16 anos fica marcado como menor/tutelado na ficha
    age = _age_from_birthday(app_doc.get("birthday"))
    if age is not None and age < 16:
        await db.clients.update_one({"id": app_doc["client_id"]}, {"$set": {"is_minor": True}})
    # Sócio padrinho: +1 ponto por proposta aprovada
    if app_doc.get("sponsor_id"):
        await db.clients.update_one({"id": app_doc["sponsor_id"]}, {"$inc": {"points": 1}})
        await _log_points(app_doc["sponsor_id"], 1, "membership_sponsor", app_doc["client_id"],
                          f"Sócio padrinho de {app_doc['name']}", user["email"])
    await _audit("membership_accept", user["email"], entity="client", entity_id=app_doc["client_id"],
                 summary=f"Proposta aceite: {app_doc['name']} passou a sócio nº {mn}"
                         + (" · menor/tutelado" if (age is not None and age < 16) else "")
                         + (f" · padrinho nº {app_doc.get('sponsor_member_number')} +1 ponto" if app_doc.get("sponsor_id") else ""))
    return {"ok": True, "member_number": mn}

@api_router.post("/membership-applications/{app_id}/reject")
async def reject_membership_application(app_id: str, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    app_doc = await db.membership_applications.find_one({"id": app_id}, {"_id": 0})
    if not app_doc:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    if app_doc["status"] != "pending":
        raise HTTPException(status_code=400, detail="Proposta já tratada")
    await db.membership_applications.update_one({"id": app_id}, {"$set": {"status": "rejected", "decided_at": datetime.now(timezone.utc).isoformat(), "decided_by": user["email"]}})
    await _audit("membership_reject", user["email"], entity="client", entity_id=app_doc["client_id"], summary=f"Proposta de sócio rejeitada: {app_doc['name']}")
    return {"ok": True}


class PublicMembershipIn(BaseModel):
    name: str
    birthday: str
    morada: str
    contact: str
    email: Optional[str] = None
    localidade: Optional[str] = None
    sponsor_member_number: Optional[str] = None  # sócio padrinho (facultativo)
    accept_regulations: bool = False


@api_router.post("/public/membership-application")
async def public_membership_application(body: PublicMembershipIn):
    """Formulário de adesão (app sócio / ecrã inicial, sem login).
    Fica pendente na fila de aprovação da direção."""
    name = (body.name or "").strip()
    morada = (body.morada or "").strip()
    contact = (body.contact or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome e apelido são obrigatórios")
    if not body.birthday:
        raise HTTPException(status_code=400, detail="Data de nascimento é obrigatória")
    if not morada:
        raise HTTPException(status_code=400, detail="Morada é obrigatória")
    if not contact:
        raise HTTPException(status_code=400, detail="Telemóvel é obrigatório")
    if not body.accept_regulations:
        raise HTTPException(status_code=400, detail="É obrigatório aceitar o regulamento interno")
    sponsor = None
    if (body.sponsor_member_number or "").strip():
        sponsor = await db.clients.find_one({"member_number": body.sponsor_member_number.strip(), "is_member": True},
                                            {"_id": 0, "id": 1, "name": 1, "member_number": 1})
        if not sponsor:
            raise HTTPException(status_code=400, detail="Nº de sócio padrinho não encontrado")
    signed_at = datetime.now(timezone.utc).isoformat()
    cid = str(uuid.uuid4())
    await db.clients.insert_one({
        "id": cid, "name": name, "contact": contact, "email": body.email,
        "note": "Candidato a sócio (formulário digital)", "member_number": None,
        "is_member": False, "morada": morada, "pin_hash": None, "points": 0,
        "balance": 0.0, "total_spent": 0.0, "credit_limit": None,
        "birthday": body.birthday, "created_at": signed_at,
    })
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": cid,
        "client_name": name,
        "name": name,
        "morada": morada,
        "localidade": (body.localidade or "").strip(),
        "contact": contact,
        "email": body.email,
        "birthday": body.birthday,
        "accepted_regulations": True,
        "signed_at": signed_at,
        "status": "pending",
        "source": "digital_form",
        "sponsor_id": sponsor["id"] if sponsor else None,
        "sponsor_member_number": sponsor["member_number"] if sponsor else None,
        "sponsor_name": sponsor["name"] if sponsor else None,
        "created_at": signed_at,
    }
    await db.membership_applications.insert_one(doc)
    await _audit("membership_application", "formulário digital", entity="client", entity_id=cid,
                 summary=f"Nova adesão digital: {name} · assinatura {signed_at}"
                         + (f" · padrinho nº {sponsor['member_number']}" if sponsor else ""))
    doc.pop("_id", None)
    return {"ok": True, "application_id": doc["id"]}

# ---------- Chat da comunidade (sócios) ----------
PROFANITY_PT = [
    "merda", "caralho", "puta", "puta que pariu", "fodasse", "foder", "fdp", "babaca",
    "corno", "otario", "otário", "idiota", "imbecil", "estupido", "estúpido", "burro",
    "punheta", "broche", "truta", "paneleiro", "corno", "vacalhão", "canalha",
]
def _mask_profanity(text: str) -> str:
    import re as _re
    for w in sorted(PROFANITY_PT, key=len, reverse=True):
        pattern = _re.compile(_re.escape(w), _re.IGNORECASE)
        text = pattern.sub(lambda m: m.group(0)[0] + "*" * (len(m.group(0)) - 1), text)
    return text

class CommunityMessageIn(BaseModel):
    message: str
    reply_to: Optional[str] = None

@api_router.post("/community/messages")
async def post_community_message(body: CommunityMessageIn, socio: dict = Depends(get_current_socio)):
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    masked = _mask_profanity(msg[:2000])
    was_masked = masked != msg
    parent = None
    if body.reply_to:
        parent = await db.community_messages.find_one({"id": body.reply_to, "status": "visible"}, {"_id": 0, "id": 1, "client_id": 1})
        if not parent:
            raise HTTPException(status_code=404, detail="Mensagem original não encontrada")
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": socio["id"],
        "author_name": socio["name"],
        "member_number": socio.get("member_number"),
        "message": masked,
        "original_masked": was_masked,
        "reply_to": body.reply_to if body.reply_to else None,
        "status": "visible",  # visible | hidden
        "reports": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.community_messages.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/community/messages")
async def get_community_messages(socio: dict = Depends(get_current_socio)):
    items = await db.community_messages.find({"status": "visible"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    visible_ids = {m["id"] for m in items}
    # respostas a mensagens ocultas/eliminadas não aparecem
    items = [m for m in items if not m.get("reply_to") or m["reply_to"] in visible_ids]
    last_seen = await db.clients.find_one({"id": socio["id"]}, {"community_last_seen": 1, "_id": 0}) or {}
    unseen = sum(1 for m in items if (last_seen.get("community_last_seen") or "") < m["created_at"])
    return {"messages": items, "unseen": unseen}

@api_router.post("/community/seen")
async def community_seen(socio: dict = Depends(get_current_socio)):
    await db.clients.update_one({"id": socio["id"]}, {"$set": {"community_last_seen": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}

@api_router.post("/community/messages/{msg_id}/report")
async def report_community_message(msg_id: str, socio: dict = Depends(get_current_socio)):
    msg = await db.community_messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    already = any(r.get("client_id") == socio["id"] for r in msg.get("reports", []))
    if already:
        raise HTTPException(status_code=400, detail="Já denunciaste esta mensagem")
    report = {
        "client_id": socio["id"],
        "client_name": socio["name"],
        "at": datetime.now(timezone.utc).isoformat(),
    }
    await db.community_messages.update_one({"id": msg_id}, {"$push": {"reports": report}})
    await _audit("community_report", socio["name"], entity="community_message", entity_id=msg_id, summary=f"Mensagem da comunidade denunciada por {socio['name']} · autor: {msg.get('author_name', '—')}")
    return {"ok": True}

@api_router.get("/community/messages/staff")
async def community_messages_staff(status_filter: Optional[str] = None, user: dict = Depends(require_role("admin", "tesoureiro", "presidente", "funcionario"))):
    """Painel de moderação: todas as mensagens + denúncias pendentes."""
    q = {"status": status_filter} if status_filter else {}
    items = await db.community_messages.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    pending_reports = sum(1 for m in items for _ in m.get("reports", []) if not m.get("reports_resolved"))
    return {"messages": items, "pending_reports_count": pending_reports}

@api_router.post("/community/messages/{msg_id}/hide")
async def hide_community_message(msg_id: str, user: dict = Depends(require_role("admin", "tesoureiro", "presidente", "funcionario"))):
    msg = await db.community_messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await db.community_messages.update_one({"id": msg_id}, {"$set": {"status": "hidden", "hidden_by": user["email"], "hidden_at": datetime.now(timezone.utc).isoformat()}})
    await _audit("community_hide", user["email"], entity="community_message", entity_id=msg_id, before={"message": msg.get("message")}, summary=f"Mensagem de {msg.get('author_name', '—')} ocultada (moderação)")
    return {"ok": True}

@api_router.post("/community/messages/{msg_id}/unhide")
async def unhide_community_message(msg_id: str, user: dict = Depends(require_role("admin", "tesoureiro", "presidente", "funcionario"))):
    await db.community_messages.update_one({"id": msg_id}, {"$set": {"status": "visible"}, "$unset": {"hidden_by": "", "hidden_at": ""}})
    await _audit("community_unhide", user["email"], entity="community_message", entity_id=msg_id, summary="Mensagem da comunidade reexibida (moderação)")
    return {"ok": True}

@api_router.delete("/community/messages/{msg_id}")
async def delete_community_message(msg_id: str, user: dict = Depends(require_role("admin"))):
    """Eliminar definitivamente só é permitido à administração — funcionários apenas ocultam."""
    msg = await db.community_messages.find_one({"id": msg_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await db.community_messages.delete_one({"id": msg_id})
    await _audit("community_delete", user["email"], entity="community_message", entity_id=msg_id, before=msg, summary=f"Mensagem de {msg.get('author_name', '—')} ELIMINADA (moderação)")
    return {"ok": True}

# ---------- Extras do portal do sócio ----------
@api_router.get("/socio/top-products")
async def socio_top_products(scope: str = "mine", socio: dict = Depends(get_current_socio)):
    """Venda rápida: top 10 produtos mais vendidos (global) ou do sócio (scope=mine, top 5)."""
    if scope == "global":
        return [{k: v for k, v in p.items() if k != "cost_price"} for p in await _top_products_global(10)]
    sales = await db.sales.find({"client_id": socio["id"], "source": {"$ne": "quota"}}, {"_id": 0, "items": 1}).to_list(5000)
    agg: dict = {}
    for s in sales:
        for it in s.get("items", []):
            e = agg.setdefault(it["product_name"], {"product_name": it["product_name"], "quantity": 0, "total": 0.0})
            e["quantity"] += int(it.get("quantity", 0))
            e["total"] += float(it.get("subtotal", 0))
    top = sorted(agg.values(), key=lambda x: x["total"], reverse=True)[:5]
    if top:
        return top
    # Sem histórico pessoal de vendas (ex.: início de mandato) — fallback:
    # os 5 primeiros produtos disponíveis por ordem alfabética.
    prods = await db.products.find(
        {"is_quota": {"$ne": True}, "is_house_account": {"$ne": True}, "unavailable": {"$ne": True}, "quantity": {"$gt": 0}},
        {"_id": 0, "name": 1, "price": 1},
    ).sort("name", 1).to_list(5)
    return [{"product_name": p["name"], "quantity": 0, "total": float(p.get("price", 0))} for p in prods]

@api_router.get("/socio/quota-status")
async def socio_quota_status(socio: dict = Depends(get_current_socio)):
    return await _quota_overall_status(socio["id"]) or {"status": "none", "label": "—", "detail": None}

async def _require_socio_finance_gate(socio: dict):
    """Contas do clube: só para sócios com as cotas dos últimos 6 meses regularizadas."""
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Lisbon"))
    except Exception:
        now = datetime.now(timezone.utc)
    all_docs = await db.quotas.find({"client_id": socio["id"]}, {"_id": 0}).to_list(100)
    by_year: dict = {}
    for q in all_docs:
        by_year.setdefault(q["year"], {})[q["month"]] = q
    # últimos 6 meses anteriores ao mês corrente (pode cruzar o ano anterior)
    months_to_check = []
    m, y = now.month, now.year
    for _ in range(6):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
        months_to_check.append((y, m))
    not_paid = [(yy, mm) for (yy, mm) in months_to_check if by_year.get(yy, {}).get(mm, {}).get("status") != "paid"]
    if not_paid:
        raise HTTPException(status_code=403, detail="Cotas por regularizar — consulta as contas junto à ARDN.")
    return now


@api_router.get("/socio/balance-monthly")
async def socio_balance_monthly(socio: dict = Depends(get_current_socio)):
    """Balanço mensal do clube (visão do sócio): receitas, despesas detalhadas
    (fornecedor e valor) e saldos. Transferências caixa ↔ banco não são despesas."""
    now = await _require_socio_finance_gate(socio)
    date_from = now.strftime("%Y-%m-01")
    date_to = now.strftime("%Y-%m-%d")
    data = await _finance_summary(date_from, date_to)
    expenses = [
        {
            "kind": "order",
            "supplier": o.get("supplier_name") or "—",
            "amount": float(o.get("total", 0) or 0),
            "created_at": o.get("created_at"),
        }
        for o in data["details"].get("orders", [])
    ] + [
        {
            "kind": "expense",
            "supplier": e.get("supplier_name") or "—",
            "description": e.get("description"),
            "amount": float(e.get("amount", 0) or 0),
            "created_at": e.get("created_at"),
        }
        for e in data["details"].get("expenses", [])
    ]
    expenses.sort(key=lambda x: x.get("created_at") or "")
    balances = await _account_balances()
    return {
        "month": now.strftime("%m/%Y"),
        "period": data["period"],
        "income": data["income"],
        "expense_lines": expenses,
        "expenses": {
            "supplier_orders": data["expenses"]["supplier_orders"],
            "supplier_expenses": data["expenses"]["supplier_expenses"],
            "total": data["expenses"]["total"],
        },
        "balance": data["balance"],
        "generated_at": data["generated_at"],
        "club_name": data["club_name"],
        "bank_balance": balances["bank_balance"],
        "cash_balance": balances["cash_balance"],
        "total_balance": round(balances["bank_balance"] + balances["cash_balance"], 2),
    }


@api_router.get("/socio/balance-quarterly")
async def socio_balance_quarterly(socio: dict = Depends(get_current_socio)):
    """Balanço trimestral da associação — apenas para sócios com cotas regularizadas
    nos últimos 6 meses anteriores ao mês corrente."""
    now = await _require_socio_finance_gate(socio)
    year = now.year
    # Balanço do trimestre corrente (T1/T2/T3/T4) — resumo Deve/Haver sem detalhes nominais
    quarter = (now.month - 1) // 3 + 1
    quarter_start_month = 3 * (quarter - 1) + 1
    date_from = f"{year}-{quarter_start_month:02d}-01"
    date_to = now.strftime("%Y-%m-%d")
    data = await _finance_summary(date_from, date_to)
    # Saldos contabilísticos (todas as datas) — descontam despesas pagas
    # em caixa ou por banco (com nº de nota de pagamento)
    balances = await _account_balances()
    bank_balance = balances["bank_balance"]
    cash_balance = balances["cash_balance"]
    return {
        "quarter": f"T{quarter}/{year}",
        "period": data["period"],
        "income": data["income"],
        "expenses": data["expenses"],
        "balance": data["balance"],
        "counts": data["counts"],
        "generated_at": data["generated_at"],
        "club_name": data["club_name"],
        # Saldos contabilísticos (banco + caixa)
        "bank_balance": bank_balance,
        "cash_balance": cash_balance,
        "total_balance": round(bank_balance + cash_balance, 2),
    }


# ---------- Venda rápida: produtos mais vendidos (global, top 10) ----------
@api_router.get("/products/top")
async def products_top(limit: int = 10, user: dict = Depends(get_current_user)):
    """Top N de produtos mais vendidos (global) para venda rápida no POS."""
    limit = min(max(limit, 1), 20)
    items = await _top_products_global(limit)
    if not _can_see_cost(user):
        for p in items:
            p.pop("cost_price", None)
    return items


async def _top_products_global(limit: int) -> list:
    qty_by_pid: dict = {}
    async for s in db.sales.find({}, {"items": 1}):
        for it in s.get("items", []):
            pid = it.get("product_id")
            if not pid or str(pid).startswith("quota-") or it.get("is_house_account"):
                continue
            qty_by_pid[pid] = qty_by_pid.get(pid, 0) + int(it.get("quantity", 0))
    top = sorted(qty_by_pid.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    pids = [pid for pid, _ in top]
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(len(pids))}
    out = []
    for pid, qty in top:
        p = prods.get(pid)
        if not p or p.get("is_quota"):
            continue
        out.append({**p, "sold_qty": qty})
    if out:
        return out
    # Sem histórico de vendas (ex.: início de mandato) — a venda rápida mostra
    # os produtos disponíveis por ordem alfabética.
    return await db.products.find(
        {"is_quota": {"$ne": True}, "is_house_account": {"$ne": True}, "unavailable": {"$ne": True}, "quantity": {"$gt": 0}},
        {"_id": 0},
    ).sort("name", 1).to_list(limit)


# ---------- Cartão de Sócio Digital (QR dinâmico) ----------
import hmac as _hmac
import hashlib as _hashlib


@api_router.get("/socio/card-code")
async def socio_card_code(socio: dict = Depends(get_current_socio)):
    """Código dinâmico para o cartão digital: roda a cada minuto (HMAC do nº de sócio + janela temporal)."""
    now_ts = int(datetime.now(timezone.utc).timestamp())
    bucket = now_ts // 60
    msg = f"{socio['member_number']}:{bucket}".encode()
    sig = _hmac.new(JWT_SECRET.encode(), msg, _hashlib.sha256).hexdigest()[:8].upper()
    code = f"ARD-{socio['member_number']}-{sig}"
    return {
        "code": code,
        "member_number": socio["member_number"],
        "name": socio["name"],
        "valid_seconds": 60 - (now_ts % 60),
    }


class CardVerifyIn(BaseModel):
    code: str


@api_router.post("/socio/card-verify")
async def card_verify(body: CardVerifyIn, user: dict = Depends(get_current_user)):
    """Staff valida o cartão digital do sócio (aceita janela atual e anterior)."""
    parts = (body.code or "").strip().split("-")
    if len(parts) != 3 or parts[0] != "ARD":
        return {"valid": False, "reason": "Formato inválido"}
    mn, sig = parts[1], parts[2]
    now_ts = int(datetime.now(timezone.utc).timestamp())
    for b in (now_ts // 60, now_ts // 60 - 1):
        expect = _hmac.new(JWT_SECRET.encode(), f"{mn}:{b}".encode(), _hashlib.sha256).hexdigest()[:8].upper()
        if sig == expect:
            c = await db.clients.find_one({"member_number": mn}, {"_id": 0, "pin_hash": 0})
            if not c:
                return {"valid": False, "reason": "Sócio não encontrado"}
            await _audit("card_verify", user["email"], entity="client", entity_id=c["id"], summary=f"Cartão digital validado: {c['name']} (nº {mn})")
            return {"valid": True, "client": c}
    return {"valid": False, "reason": "Código expirado — pede ao sócio para atualizar o cartão"}


# ---------- Loja de merchandising (adeptos) ----------
@api_router.get("/socio/merch")
async def socio_merch(socio: dict = Depends(get_current_socio)):
    """Produtos de merchandising (adeptos) — visíveis mas indisponíveis para venda."""
    items = await db.products.find(
        {"category": "Merchandising"},
        {"_id": 0},
    ).sort("name", 1).to_list(100)
    return items


# ---------- Recuperação de PIN (público, gera mensagem à direção) ----------
class SocioRecoverPinIn(BaseModel):
    member_number: str
    contact: str


@api_router.post("/socio/recover-pin")
async def socio_recover_pin(body: SocioRecoverPinIn):
    """Sócio esqueceu o PIN: nº de sócio + telemóvel → mensagem aos administradores/tesoureiro."""
    mn = body.member_number.strip()
    c = await db.clients.find_one({"member_number": mn}, {"_id": 0, "pin_hash": 0})
    if not c or not c.get("pin_hash"):
        raise HTTPException(status_code=404, detail="Nº de sócio não encontrado ou sem acesso ao portal")
    digits_in = "".join(ch for ch in (body.contact or "") if ch.isdigit())
    digits_db = "".join(ch for ch in (c.get("contact") or "") if ch.isdigit())
    if not digits_in or not digits_db or digits_in[-9:] != digits_db[-9:]:
        raise HTTPException(status_code=403, detail="O contacto indicado não corresponde ao registado para este nº de sócio")
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": c["id"],
        "client_name": c["name"],
        "subject": "🔑 Recuperação de PIN",
        "message": f"O sócio {c['name']} (nº {mn}, tel. {body.contact}) esqueceu o PIN e pede um novo. Enviar novo PIN ao sócio (ficha do cliente → PIN).",
        "from_staff": False,
        "status": "open",  # open | replied | archived
        "reply": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await _audit("pin_recover_request", c["name"], entity="client", entity_id=c["id"], summary=f"Sócio {c['name']} (nº {mn}) pediu recuperação de PIN")
    return {"ok": True, "message": "Pedido enviado à direção — vai receber o novo PIN em breve."}


# ---------- Agregado familiar ----------
class DependentIn(BaseModel):
    name: str
    contact: Optional[str] = None
    birthday: Optional[str] = None
    note: Optional[str] = None


class DependentQuotaPayIn(BaseModel):
    dependent_id: str
    year: int
    months: List[int]
    mbway_phone: str


def _is_tutelado(socio: dict) -> bool:
    return bool(socio.get("family_head_client_id"))


async def _maybe_end_tutela(client: dict) -> dict:
    """Ao completar 16 anos o sócio deixa de ser tutelado (is_minor removido)."""
    if client.get("is_minor") and client.get("birthday"):
        age = _age_from_birthday(client.get("birthday"))
        if age is not None and age >= 16:
            await db.clients.update_one({"id": client["id"]}, {"$set": {"is_minor": False}})
            client["is_minor"] = False
    return client


@api_router.get("/socio/family")
async def socio_family(socio: dict = Depends(get_current_socio)):
    """Agregado familiar do titular: dependentes com quotas e estado de conta."""
    if _is_tutelado(socio):
        raise HTTPException(status_code=403, detail="Sócios tutelados não têm agregado familiar — é o tutor que gere a tua conta")
    deps = await db.clients.find({"family_head_client_id": socio["id"]}, {"_id": 0, "pin_hash": 0}).sort("name", 1).to_list(50)
    out = []
    for d in deps:
        d["quotas"] = await db.quotas.find({"client_id": d["id"]}, {"_id": 0}).sort("year", 1).to_list(50)
        d["quota_status"] = await _quota_overall_status(d["id"])
        d["used_this_month"] = await _monthly_consumption(d["id"])
        out.append(d)
    return out


class DependentLimitIn(BaseModel):
    dependent_id: str
    consumption_limit: Optional[float] = None  # None = sem limite


@api_router.post("/socio/family/limit")
async def socio_family_set_limit(body: DependentLimitIn, socio: dict = Depends(get_current_socio)):
    """Titular define o limite de consumo mensal de um menor do agregado (€/mês)."""
    dep = await db.clients.find_one({"id": body.dependent_id, "family_head_client_id": socio["id"]}, {"_id": 0})
    if not dep:
        raise HTTPException(status_code=404, detail="Dependente não encontrado no teu agregado")
    lim = body.consumption_limit
    if lim is not None:
        if lim < 0:
            raise HTTPException(status_code=400, detail="Limite inválido")
        lim = round(float(lim), 2)
    await db.clients.update_one({"id": dep["id"]}, {"$set": {"consumption_limit": lim}})
    await _audit(
        "family_limit_set", socio.get("name") or socio["id"], entity="client", entity_id=dep["id"],
        summary=f"Limite de consumo de {dep['name']}: {'sem limite' if lim in (None, 0) else f'{lim:.2f} €/mês'}",
    )
    return {"ok": True, "dependent_id": dep["id"], "consumption_limit": lim, "used_this_month": await _monthly_consumption(dep["id"])}


def _age_from_birthday(birthday: Optional[str]) -> Optional[int]:
    if not birthday:
        return None
    try:
        b = datetime.fromisoformat(str(birthday)[:10]).date()
    except ValueError:
        return None
    today = _lisbon_now().date()
    return today.year - b.year - ((today.month, today.day) < (b.month, b.day))


@api_router.post("/socio/family")
async def socio_add_dependent(body: DependentIn, socio: dict = Depends(get_current_socio)):
    """Titular pede a inscrição de um familiar no agregado.
    O pedido fica PENDENTE de aprovação da administração — ao aprovar é criada
    a ficha de sócio (nº automático) e, com menos de 16 anos, fica menor/tutelado."""
    if _is_tutelado(socio):
        raise HTTPException(status_code=403, detail="Sócios tutelados não podem inscrever agregado familiar")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome do dependente obrigatório")
    count = await db.clients.count_documents({"family_head_client_id": socio["id"]})
    pending = await db.family_requests.count_documents({"family_head_client_id": socio["id"], "status": "pending"})
    if count + pending >= 15:
        raise HTTPException(status_code=400, detail="Agregado familiar completo (máx. 15 dependentes)")
    doc = {
        "id": str(uuid.uuid4()),
        "family_head_client_id": socio["id"],
        "family_head_name": socio["name"],
        "name": name,
        "birthday": body.birthday,
        "contact": body.contact,
        "note": body.note or "Agregado familiar",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.family_requests.insert_one(doc)
    await _audit("family_request", socio.get("name") or socio["id"], entity="family_request", entity_id=doc["id"],
                 summary=f"Pedido de inscrição no agregado de {socio['name']}: {name} — aguarda aprovação")
    doc.pop("_id", None)
    return doc


@api_router.get("/socio/family/requests")
async def socio_family_requests(socio: dict = Depends(get_current_socio)):
    if _is_tutelado(socio):
        raise HTTPException(status_code=403, detail="Sócios tutelados não têm agregado familiar")
    return await db.family_requests.find({"family_head_client_id": socio["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)


@api_router.get("/family-requests")
async def list_family_requests(status_filter: Optional[str] = None, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    q = {"status": status_filter} if status_filter else {}
    return await db.family_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)


@api_router.post("/family-requests/{req_id}/approve")
async def approve_family_request(req_id: str, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    """Aprova a inscrição: cria a ficha de sócio com nº automático; <16 anos fica tutelado."""
    req = await db.family_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Pedido já tratado")
    members = await db.clients.find({"is_member": True, "member_number": {"$exists": True, "$ne": None}},
                                    {"_id": 0, "member_number": 1}).to_list(5000)
    nums = []
    for m in members:
        try:
            nums.append(int(str(m["member_number"]).strip()))
        except ValueError:
            continue
    mn = str((max(nums) + 1) if nums else 1)
    age = _age_from_birthday(req.get("birthday"))
    is_minor = age is not None and age < 16
    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "name": req["name"],
        "contact": req.get("contact"),
        "email": None,
        "note": req.get("note") or "Agregado familiar",
        "member_number": mn,
        "is_member": True,
        "morada": None,
        "pin_hash": None,
        "points": 0,
        "balance": 0.0,
        "total_spent": 0.0,
        "credit_limit": None,
        "family_head_client_id": req["family_head_client_id"],
        "birthday": req.get("birthday"),
        "is_minor": is_minor,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    auto = auto_pin_from_member_number(mn)
    if auto:
        doc["pin_hash"] = hash_password(auto)
    await db.clients.insert_one(doc)
    await db.family_requests.update_one({"id": req_id}, {"$set": {
        "status": "approved", "client_id": cid, "member_number": mn,
        "decided_at": datetime.now(timezone.utc).isoformat(), "decided_by": user["email"],
    }})
    await _audit("family_request_approve", user["email"], entity="client", entity_id=cid,
                 summary=f"Agregado de {req.get('family_head_name')}: {req['name']} aprovado como sócio nº {mn}"
                         + (" · menor/tutelado" if is_minor else ""))
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": req["family_head_client_id"],
        "client_name": req.get("family_head_name") or "",
        "subject": "✅ Inscrição no agregado aprovada",
        "message": f"A inscrição de {req['name']} foi aprovada — é agora sócio nº {mn}"
                   + (" (menor/tutelado)." if is_minor else "."),
        "from_staff": True,
        "reply": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    doc.pop("_id", None)
    doc.pop("pin_hash", None)
    return doc


@api_router.post("/family-requests/{req_id}/reject")
async def reject_family_request(req_id: str, user: dict = Depends(require_role("admin", "tesoureiro", "presidente"))):
    req = await db.family_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Pedido já tratado")
    await db.family_requests.update_one({"id": req_id}, {"$set": {
        "status": "rejected", "decided_at": datetime.now(timezone.utc).isoformat(), "decided_by": user["email"],
    }})
    await _audit("family_request_reject", user["email"], entity="family_request", entity_id=req_id,
                 summary=f"Pedido de agregado rejeitado: {req['name']} (titular {req.get('family_head_name')})")
    return {"ok": True}


@api_router.post("/socio/family/quotas/pay")
async def socio_family_quotas_pay(body: DependentQuotaPayIn, socio: dict = Depends(get_current_socio)):
    """Titular paga quotas de um dependente do agregado via MBWay."""
    dep = await db.clients.find_one({"id": body.dependent_id, "family_head_client_id": socio["id"]}, {"_id": 0})
    if not dep:
        raise HTTPException(status_code=404, detail="Dependente não encontrado no teu agregado")
    if not body.months:
        raise HTTPException(status_code=400, detail="Sem meses selecionados")
    already = await db.quotas.find({"client_id": dep["id"], "year": body.year, "month": {"$in": body.months}, "status": {"$in": ["paid", "billed"]}, "reversed": {"$ne": True}}, {"_id": 0}).to_list(20)
    if already:
        raise HTTPException(status_code=400, detail=f"Já lançadas na conta corrente: {', '.join(MONTHS_PT[a['month']-1] for a in already)}")
    total = QUOTA_MONTHLY_VALUE * len(body.months)
    rec = {
        "id": str(uuid.uuid4()),
        "client_id": dep["id"],
        "client_name": f"{dep['name']} (agregado de {socio['name']})",
        "amount": total,
        "mbway_phone": body.mbway_phone.strip(),
        "note": f"Cotas {body.year} · {dep['name']}: {', '.join(MONTHS_PT[m-1] for m in body.months)}",
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


# ---------- Match Center (FPF · A.F. Guarda) ----------
FPF_COMPETITION_URL = os.environ.get(
    "FPF_COMPETITION_URL",
    "https://resultados.fpf.pt/Competition/Details?competitionId=30210&seasonId=106",
)
FPF_READER = "https://r.jina.ai/"
_match_center_cache: dict = {"ts": 0.0, "data": None}


def _fetch_via_reader(url: str) -> str:
    import urllib.request
    req = urllib.request.Request(f"{FPF_READER}{url}", headers={"User-Agent": "Mozilla/5.0", "X-Return-Format": "markdown"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def _parse_fpf_markdown(md: str) -> dict:
    """Extrai classificação + jogos da jornada atual do markdown da FPF."""
    lines = [ln.strip() for ln in md.splitlines() if ln.strip()]
    # ---- Classificação (POS JGS V E D GM GS PTS) ----
    standings = []
    header_idx = next((i for i, ln in enumerate(lines) if ln == "POS" and i + 2 < len(lines)), None)
    if header_idx is not None:
        j = header_idx + 1
        while j < len(lines) and len(standings) < 30:
            if lines[j].isdigit():
                pos = int(lines[j])
                team = lines[j + 1]
                nums = [lines[j + k] for k in range(2, 9)]
                if all(n.isdigit() for n in nums) and not team.isdigit():
                    standings.append({"pos": pos, "team": team, "j": int(nums[0]), "v": int(nums[1]), "e": int(nums[2]), "d": int(nums[3]), "gm": int(nums[4]), "gs": int(nums[5]), "pts": int(nums[6])})
                    j += 9
                    continue
                j += 1
            else:
                j += 1
    # ---- Jornadas disponíveis ----
    fixtures = []
    for m in re.finditer(r"\[(\d+)\]\(https://resultados\.fpf\.pt/Competition/GetClassificationAndMatchesByFixture\?fixtureId=(\d+)\)", md):
        fixtures.append({"number": int(m.group(1)), "fixture_id": int(m.group(2))})
    # ---- Jogos da jornada mostrada (blocos [equipas e resultado](link FPF)) ----
    matches = _parse_fpf_match_blocks(md)
    return {"standings": standings, "fixtures": fixtures, "matches": matches}


def _split_match_md(md: str) -> list:
    """Blocos de jogo no markdown da FPF: [Gd Trancoso\\ \\ 3 - 2 \\ 4 out\\ \\ Gc Figueirense\\ \\ Estadio ...](link)."""
    out = []
    block_re = re.compile(r"\[([^\]]+)\]\(https://resultados\.fpf\.pt/Match/GetMatchInformation\?matchId=(\d+)\)")
    for m in block_re.finditer(md):
        inner = m.group(1).replace("\\", " ")
        inner = " ".join(inner.split())
        out.append({"raw": inner, "id": m.group(2), "url": f"https://resultados.fpf.pt/Match/GetMatchInformation?matchId={m.group(2)}"})
    return out


def _parse_fpf_match_blocks(md: str) -> list:
    matches = []
    for blk in _split_match_md(md):
        inner = blk["raw"]
        mm = re.match(r"^(.+?)\s+(\d+)\s*-\s*(\d+)\s+([0-9]{1,2}\s+[a-zçã]+)\s+(.+)$", inner, re.IGNORECASE)
        if not mm:
            # Jogo agendado (sem resultado): "EquipA - EquipB · data"
            mm = re.match(r"^(.+?)\s*-\s*(.+?)\s+([0-9]{1,2}\s+[a-zçã]+)\s*$", inner, re.IGNORECASE)
            if mm:
                matches.append({"id": blk["id"], "team1": mm.group(1).strip(), "score1": None, "score2": None, "date": mm.group(3).strip(), "team2": mm.group(2).strip(), "venue": "", "url": blk["url"], "status": "scheduled"})
            continue
        rest = mm.group(5).strip()
        venue = ""
        t2 = rest
        vm = re.search(r"(Estadi[oá]|Campo)\s+.*$", rest, re.IGNORECASE)
        if vm:
            venue = vm.group(0).strip()
            t2 = rest[: vm.start()].strip()
        matches.append({
            "id": blk["id"],
            "team1": mm.group(1).strip(),
            "score1": int(mm.group(2)),
            "score2": int(mm.group(3)),
            "date": mm.group(4).strip(),
            "team2": t2,
            "venue": venue,
            "url": blk["url"],
            "status": "finished",
        })
    return matches


@api_router.get("/match-center")
async def match_center(refresh: bool = False, user: dict = Depends(get_current_user)):
    """Match Center: classificação, calendário de jornadas e jogos (FPF · A.F. Guarda)."""
    now = datetime.now(timezone.utc).timestamp()
    if not refresh and _match_center_cache["data"] and now - _match_center_cache["ts"] < 120:
        return _match_center_cache["data"]
    try:
        md = _fetch_via_reader(FPF_COMPETITION_URL)
        parsed = _parse_fpf_markdown(md)
        data = {**parsed, "competition": "1ª LIGA FUTEBOL CIMA-TAVFER", "fetched_at": datetime.now(timezone.utc).isoformat(), "source": FPF_COMPETITION_URL, "ok": True}
        if parsed.get("standings") or parsed.get("fixtures"):
            _match_center_cache.update({"ts": now, "data": data})
        return data
    except Exception as e:
        return {"ok": False, "error": f"FPF indisponível: {e}", "standings": [], "fixtures": [], "matches": []}


@api_router.get("/match-center/jornada/{fixture_id}")
async def match_center_jornada(fixture_id: int, user: dict = Depends(get_current_user)):
    """Jogos + classificação de uma jornada específica da FPF."""
    url = f"https://resultados.fpf.pt/Competition/GetClassificationAndMatchesByFixture?fixtureId={fixture_id}"
    try:
        md = _fetch_via_reader(url)
        parsed = _parse_fpf_markdown(md)
        matches_raw = _split_match_md(md)
        return {**parsed, "matches_raw": matches_raw[:20], "fixture_id": fixture_id, "ok": True}
    except Exception as e:
        return {"ok": False, "error": f"FPF indisponível: {e}", "standings": [], "fixtures": [], "matches": [], "matches_raw": []}
    # trimestre corrente
    q_index = (now.month - 1) // 3  # 0..3
    q_start_month = q_index * 3 + 1
    q_end_month = q_start_month + 2
    date_from = f"{now.year}-{q_start_month:02d}-01"
    last_day = (datetime(now.year, q_end_month + 1, 1) - timedelta(days=1)).day if q_end_month < 12 else 31
    date_to = f"{now.year}-{q_end_month:02d}-{last_day:02d}"
    data = await _finance_summary(date_from, date_to)
    return {
        "period": {"from": date_from, "to": date_to, "quarter": f"Q{q_index + 1} {now.year}"},
        "income": data["income"],
        "expenses": data["expenses"],
        "balance": data["balance"],
        "counts": data["counts"],
        "generated_at": data["generated_at"],
        "club_name": data["club_name"],
    }

# ---------- Rodada Mista (mesa de grupo no POS) ----------
# Uma mesa junta 2+ sócios. As rodadas pedidas acumulam numa conta temporária
# de grupo e são liquidadas de duas formas:
#   · rotação de pagadores — cada rodada é assumida (e paga) por um sócio;
#   · divisão da conta — partes iguais ou por consumo real de cada sócio.
# Em qualquer dos casos cada sócio recebe presença do dia e os pontos da
# rodada revertem para quem a liquidou.

class GroupTableIn(BaseModel):
    member_ids: List[str]
    label: Optional[str] = None

class GroupRoundIn(BaseModel):
    items: List[SaleItemIn]

class GroupRoundSettleIn(BaseModel):
    payer_client_id: str
    method: str = "account"  # account | cash | mbway

class GroupSplitIn(BaseModel):
    mode: str = "equal"  # equal | items
    methods: Optional[dict] = None          # {client_id: account|cash|mbway}
    items_by_member: Optional[dict] = None  # {client_id: [{product_id, quantity}]}


def _group_member_ref(c: dict) -> str:
    first = (c.get("name") or "").split(" ")[0]
    mn = c.get("member_number")
    return f"{first} (nº {mn})" if mn else first


def _group_label(client_doc: dict) -> str:
    return f"{client_doc['name'].split(' ')[0]} (nº {client_doc.get('member_number') or '—'})"


# ---------- Presenças na sede · streak e recompensas ----------
# Um dia conta como presença quando o sócio tem pelo menos um pedido servido.
# Ao fim de N dias seguidos a recompensa em pontos é atribuída (regras da direção).
STREAK_REWARDS = {7: 1, 9: 1, 11: 1, 13: 1, 15: 2, 17: 1, 19: 1, 21: 1, 23: 1, 25: 2, 27: 1, 29: 1, 31: 5}


def _lisbon_today():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Lisbon")).date()
    except Exception:
        return datetime.now(timezone.utc).date()


def _streak_from_dates(dates: set, today=None) -> int:
    """Dias consecutivos com presença, a terminar hoje (ou ontem se hoje ainda não conta)."""
    today = today or _lisbon_today()
    cursor = today if today.isoformat() in dates else today - timedelta(days=1)
    if cursor.isoformat() not in dates:
        return 0
    n = 0
    while cursor.isoformat() in dates:
        n += 1
        cursor -= timedelta(days=1)
    return n


def _best_streak(dates: set) -> int:
    """Maior sequência de dias seguidos dentro de um conjunto de datas."""
    best = run = 0
    prev = None
    for value in sorted(dates):
        try:
            day = datetime.strptime(value, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        run = run + 1 if prev and (day - prev).days == 1 else 1
        best = max(best, run)
        prev = day
    return best


def _next_streak_reward(streak: int) -> Optional[int]:
    for day in sorted(STREAK_REWARDS):
        if day > streak:
            return day
    return None


async def _presence_dates(client_id: str) -> set:
    docs = await db.presences.find({"client_id": client_id}, {"_id": 0, "date": 1}).to_list(10000)
    return {d["date"] for d in docs if d.get("date")}


async def _apply_streak_reward(presence: dict, factor: float, reason: str) -> int:
    """Atribui os pontos da recompensa de streak (fator 1 = total, 0,5 = metade)."""
    points = int(presence.get("reward_points") or 0)
    applied = int(round(points * factor)) if points > 0 else 0
    if applied <= 0:
        return 0
    await db.clients.update_one({"id": presence["client_id"]}, {"$inc": {"points": applied}})
    await _log_points(
        presence["client_id"], applied, "presence_streak", presence["id"],
        f"{presence.get('streak', 0)} dias seguidos na sede · {reason}", "sistema",
    )
    await db.presences.update_one(
        {"id": presence["id"]},
        {"$set": {"reward_status": "granted", "points_applied": applied, "reward_reason": reason,
                  "reward_granted_at": datetime.now(timezone.utc).isoformat()}},
    )
    return applied


async def _settle_streak_rewards(client_id: str) -> int:
    """Cotas regularizadas (🟢): as recompensas bloqueadas por estarem 🟡 passam a valer metade."""
    qs = await _quota_overall_status(client_id)
    if not qs or qs.get("status") != "paid":
        return 0
    blocked = await db.presences.find(
        {"client_id": client_id, "reward_status": "blocked_pending"}, {"_id": 0}
    ).to_list(500)
    total = 0
    for p in blocked:
        total += await _apply_streak_reward(p, 0.5, "regularização de cotas · metade dos pontos")
    return total


async def _mark_presence(client_id: str, table_id: Optional[str] = None, source: str = "group_round") -> Optional[dict]:
    """Presença do dia (uma por sócio e por dia) + recompensa do streak.
    🔴 Em dívida → presença fica registada mas não pontua;
    🟡 Por regularizar → bloqueada até regularizar (depois vale metade)."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "is_member": 1, "is_temp": 1, "is_walkin": 1})
    if not client or not client.get("is_member") or client.get("is_temp") or client.get("is_walkin"):
        return None
    day = _lisbon_today().isoformat()
    if await db.presences.find_one({"client_id": client_id, "date": day}, {"_id": 1}):
        return None
    dates = await _presence_dates(client_id)
    dates.add(day)
    streak = _streak_from_dates(dates)
    reward = STREAK_REWARDS.get(streak, 0)
    qs = await _quota_overall_status(client_id)
    status = (qs or {}).get("status")
    if not reward:
        reward_status = "none"
    elif status == "paid":
        reward_status = "granted"
    elif status == "pending":
        reward_status = "blocked_pending"
    else:
        reward_status = "blocked_debt"
    doc = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "date": day,
        "source": source,
        "table_id": table_id,
        "streak": streak,
        "reward_points": reward,
        "reward_status": reward_status,
        "points_applied": 0,
        "quota_status": status,
        "popup_seen": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.presences.insert_one(doc)
    if reward_status == "granted":
        doc["points_applied"] = await _apply_streak_reward(doc, 1.0, "dia de streak completo")
    doc.pop("_id", None)
    return doc


async def _group_sale(table: dict, client_doc: dict, label: str, total: float,
                      detail_items: list, user: dict, round_number: Optional[int] = None) -> dict:
    """Cria a venda/lançamento de uma rodada ou partilha para um sócio.
    O stock já foi abatido no lançamento da rodada, por isso aqui não se mexe no stock."""
    total = round(float(total), 2)
    is_member = bool(client_doc.get("is_member"))
    points_earned, new_pending = (0, 0.0)
    if is_member:
        points_earned, new_pending = await _compute_points_with_rollover(client_doc, total)
    tx_no = await _next_tx_number()
    sale = {
        "id": str(uuid.uuid4()),
        "tx_number": tx_no,
        "client_id": client_doc["id"],
        "client_name": client_doc["name"],
        "items": [{
            "product_id": f"group-{table['id']}",
            "product_name": label,
            "unit_price": total,
            "quantity": 1,
            "subtotal": total,
        }],
        "group_items": detail_items,
        "group_table_id": table["id"],
        "group_round": round_number,
        "group_label": label,
        "total": total,
        "points_earned": points_earned,
        "is_member_at_sale": is_member,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
        "source": "group_round",
    }
    await db.sales.insert_one(sale)
    op = {"$inc": {"balance": total, "total_spent": total, "points": points_earned}}
    if is_member:
        op["$set"] = {"points_pending_value": new_pending}
    await db.clients.update_one({"id": client_doc["id"]}, op)
    if points_earned:
        await _log_points(client_doc["id"], points_earned, "group_round", sale["id"], f"{label} · {total:.2f} €", user["email"])
    await _audit("group_round_sale", user["email"], entity="sale", entity_id=sale["id"], tx_number=tx_no,
                 summary=f"Rodada Mista · {client_doc['name']} · {label} · {total:.2f} €")
    sale.pop("_id", None)
    return sale


async def _settle_group_sale(sale: dict, method: str, user: dict) -> Optional[dict]:
    """Liquida na hora a venda da rodada (dinheiro/MBWay). Conta corrente fica em aberto."""
    if method not in ("cash", "mbway"):
        return None
    pay = await create_payment(
        PaymentIn(
            client_id=sale["client_id"],
            amount=float(sale["total"]),
            note=f"Rodada Mista · {sale.get('group_label')}",
            sale_ids=[sale["id"]],
        ),
        user,
    )
    if method == "mbway" and pay:
        await db.payments.update_one({"id": pay["id"]}, {"$set": {"source": "mbway"}})
        pay["source"] = "mbway"
    return pay


def _open_group_rounds(table: dict) -> list:
    return [r for r in (table.get("rounds") or []) if r.get("status") != "paid"]


async def _open_group_table(ids: List[str], label: Optional[str], actor_email: str) -> dict:
    """Abre uma mesa de Rodada Mista, notifica os sócios e marca presença."""
    ids = list(dict.fromkeys(ids or []))
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="Escolhe pelo menos 2 sócios para a Rodada Mista")
    members = await db.clients.find({"id": {"$in": ids}}, {"_id": 0, "pin_hash": 0}).to_list(len(ids))
    by_id = {m["id"]: m for m in members}
    if any(i not in by_id for i in ids):
        raise HTTPException(status_code=404, detail="Sócio não encontrado")
    if any(not by_id[i].get("is_member") or by_id[i].get("is_temp") for i in ids):
        raise HTTPException(status_code=400, detail="A Rodada Mista é só para sócios")
    ordered = [by_id[i] for i in ids]
    now_iso = datetime.now(timezone.utc).isoformat()
    table = {
        "id": str(uuid.uuid4()),
        "label": (label or "").strip() or f"Mesa de {len(ordered)}",
        "members": [{"client_id": m["id"], "name": m["name"], "member_number": m.get("member_number"),
                     "joined_round": 1} for m in ordered],
        "rounds": [],
        "status": "open",
        "created_at": now_iso,
        "created_by": actor_email,
        "closed_at": None,
    }
    await db.group_tables.insert_one(table)
    for m in ordered:
        others = [f"{_group_member_ref(o)}" for o in ordered if o["id"] != m["id"]]
        if len(others) <= 2:
            companions = " e ".join(others)
        else:
            companions = f"{others[0]}, {others[1]} e mais {len(others) - 2} amigos"
        await db.socio_messages.insert_one({
            "id": str(uuid.uuid4()),
            "client_id": m["id"],
            "client_name": m["name"],
            "subject": "🍻 Rodada Mista",
            "message": f"Entraste numa Rodada Mista com {companions}! 🍻 Divirtam-se na ARDN, bebe com moderação.",
            "from_staff": True,
            "reply": None,
            "created_at": now_iso,
            "group_table_id": table["id"],
        })
        await _mark_presence(m["id"], table["id"])
    await _audit("group_table_create", actor_email, entity="group_table", entity_id=table["id"],
                 summary=f"Rodada Mista aberta · {', '.join(m['name'] for m in ordered)}")
    table.pop("_id", None)
    return table


@api_router.post("/group-tables")
async def create_group_table(body: GroupTableIn, user: dict = Depends(get_current_user)):
    return await _open_group_table(body.member_ids, body.label, user["email"])


class GroupTableRenameIn(BaseModel):
    label: str


@api_router.put("/group-tables/{table_id}")
async def rename_group_table(table_id: str, body: GroupTableRenameIn, user: dict = Depends(get_current_user)):
    """Renomeia a mesa (ex.: "Mesa 5" → "Mesa do Fontes")."""
    table = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Rodada não encontrada")
    label = (body.label or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="Indica um nome para a mesa")
    label = label[:60]
    await db.group_tables.update_one({"id": table_id}, {"$set": {"label": label}})
    await _audit("group_table_rename", user["email"], entity="group_table", entity_id=table_id,
                 summary=f"Rodada Mista renomeada · '{table.get('label')}' → '{label}'")
    return await db.group_tables.find_one({"id": table_id}, {"_id": 0})


# ---------- Rodada Mista · app do sócio ----------
class SocioGroupTableIn(BaseModel):
    member_ids: List[str] = []
    label: Optional[str] = None


def _group_table_for_socio(table: dict, client_id: str) -> dict:
    """Resumo da mesa visto pelo sócio: rodadas, o que está em aberto e as suas partes."""
    rounds = table.get("rounds") or []
    open_rounds = [r for r in rounds if r.get("status") != "paid"]
    open_total = round(sum(float(r.get("total") or 0) for r in open_rounds), 2)
    members = table.get("members") or []
    mine_paid = round(sum(float(r.get("total") or 0) for r in rounds
                          if r.get("status") == "paid" and r.get("payer_client_id") == client_id), 2)
    return {
        "id": table["id"],
        "label": table.get("label"),
        "status": table.get("status"),
        "created_at": table.get("created_at"),
        "members": members,
        "rounds": rounds,
        "open_rounds": len(open_rounds),
        "open_total": open_total,
        "total": round(sum(float(r.get("total") or 0) for r in rounds), 2),
        "my_paid": mine_paid,
        "share_if_split": round(open_total / len(members), 2) if members and open_total else 0.0,
        "i_am_member": any(m.get("client_id") == client_id for m in members),
    }


@api_router.get("/socio/group-tables")
async def socio_group_tables(socio: dict = Depends(get_current_socio)):
    """Rodadas Mistas em que o sócio está inserido (abertas + últimas fechadas)."""
    mine = {"members.client_id": socio["id"]}
    open_tables = await db.group_tables.find({**mine, "status": "open"}, {"_id": 0}) \
        .sort("created_at", -1).to_list(20)
    closed_tables = await db.group_tables.find({**mine, "status": "closed"}, {"_id": 0}) \
        .sort("created_at", -1).to_list(5)
    return {
        "open": [_group_table_for_socio(t, socio["id"]) for t in open_tables],
        "closed": [_group_table_for_socio(t, socio["id"]) for t in closed_tables],
    }


@api_router.post("/socio/group-tables")
async def socio_create_group_table(body: SocioGroupTableIn, socio: dict = Depends(get_current_socio)):
    """O sócio inicia uma Rodada Mista a partir da app (ele é sempre um dos elementos da mesa).
    Cada sócio só pode ter UMA rodada mista aberta na app."""
    current = await db.group_tables.find_one(
        {"members.client_id": socio["id"], "status": "open"}, {"_id": 0, "label": 1})
    if current:
        raise HTTPException(
            status_code=400,
            detail=f"Já tens a Rodada Mista «{current.get('label')}» aberta. "
                   "Faz o pedido de consumo dentro dessa mesa antes de abrir outra.",
        )
    ids = [socio["id"]] + [i for i in (body.member_ids or []) if i != socio["id"]]
    table = await _open_group_table(ids, body.label, f"socio:{socio.get('member_number') or socio['id']}")
    return _group_table_for_socio(table, socio["id"])


@api_router.post("/socio/group-tables/{table_id}/rounds")
async def socio_add_group_round(table_id: str, body: GroupRoundIn, socio: dict = Depends(get_current_socio)):
    """O sócio pede consumo dentro de uma Rodada Mista em que está sentado."""
    table = await db.group_tables.find_one({"id": table_id}, {"_id": 0, "members": 1, "status": 1})
    if not table:
        raise HTTPException(status_code=404, detail="Rodada não encontrada")
    if not any(m.get("client_id") == socio["id"] for m in (table.get("members") or [])):
        raise HTTPException(status_code=403, detail="Não estás nesta Rodada Mista")
    if table.get("status") != "open":
        raise HTTPException(status_code=400, detail="Esta Rodada Mista já está fechada")
    items = [it for it in body.items if it.quantity > 0]
    if not items:
        raise HTTPException(status_code=400, detail="Escolhe pelo menos um produto")
    updated = await _append_group_round(
        table_id, items, f"socio:{socio.get('member_number') or socio['id']}", False)
    return _group_table_for_socio(updated, socio["id"])


@api_router.get("/group-tables")
async def list_group_tables(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {} if status_filter in (None, "", "all") else {"status": status_filter}
    tables = await db.group_tables.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return tables


@api_router.get("/group-tables/{table_id}")
async def get_group_table(table_id: str, user: dict = Depends(get_current_user)):
    table = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Rodada não encontrada")
    return table


@api_router.post("/group-tables/{table_id}/rounds")
async def add_group_round(table_id: str, body: GroupRoundIn, user: dict = Depends(get_current_user)):
    return await _append_group_round(table_id, body.items, user["email"], user.get("role") in ("admin", "tesoureiro"))


async def _append_group_round(table_id: str, items: list, actor_email: str, is_staff: bool) -> dict:
    """Lança uma nova rodada de consumos na mesa (staff no POS ou o próprio sócio na app)."""
    table = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Rodada não encontrada")
    if table.get("status") != "open":
        raise HTTPException(status_code=400, detail="Esta Rodada Mista já está fechada")
    if not items:
        raise HTTPException(status_code=400, detail="Sem itens")
    pids = [it.product_id for it in items]
    products = await db.products.find({"id": {"$in": pids}}, {"_id": 0}).to_list(len(pids))
    pmap = {p["id"]: p for p in products}
    try:
        from zoneinfo import ZoneInfo
        now_hour = datetime.now(ZoneInfo("Europe/Lisbon")).hour
    except Exception:
        now_hour = datetime.now(timezone.utc).hour
    line_items = []
    total = 0.0
    for it in items:
        prod = pmap.get(it.product_id)
        if not prod:
            raise HTTPException(status_code=404, detail="Produto não encontrado")
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantidade inválida")
        if prod.get("is_food") and not is_staff and not (16 <= now_hour < 20):
            raise HTTPException(status_code=400, detail=f"'{prod['name']}' só disponível das 16h às 20h")
        if prod.get("unavailable") and not is_staff:
            raise HTTPException(status_code=400, detail=f"'{prod['name']}' marcado como indisponível")
        if int(prod.get("quantity") or 0) < it.quantity:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {prod['name']}")
        unit_price = float(prod["price"])
        qty = int(it.quantity)
        subtotal = round(unit_price * qty, 2)
        total += subtotal
        line_items.append({
            "product_id": prod["id"],
            "product_name": prod["name"],
            "unit_price": unit_price,
            "quantity": qty,
            "subtotal": subtotal,
        })
    for it in items:
        await db.products.update_one({"id": it.product_id}, {"$inc": {"quantity": -int(it.quantity)}})
    round_no = len(table.get("rounds") or []) + 1
    round_doc = {
        "number": round_no,
        "items": line_items,
        "total": round(total, 2),
        "status": "open",
        "added_at": datetime.now(timezone.utc).isoformat(),
        "added_by": actor_email,
        "payer_client_id": None,
        "sale_id": None,
        # Quem estava à mesa nesta rodada (permite mostrar quem se juntou depois)
        "members": [m["client_id"] for m in (table.get("members") or [])],
    }
    await db.group_tables.update_one({"id": table_id}, {"$push": {"rounds": round_doc}})
    await _audit("group_round_add", actor_email, entity="group_table", entity_id=table_id,
                 summary=f"Rodada Mista {table.get('label')} · rodada {round_no} · {total:.2f} € · "
                         + ", ".join(f"{li['quantity']}× {li['product_name']}" for li in line_items))
    return await db.group_tables.find_one({"id": table_id}, {"_id": 0})


class GroupMembersIn(BaseModel):
    member_ids: List[str]


@api_router.post("/group-tables/{table_id}/members")
async def add_group_members(table_id: str, body: GroupMembersIn, user: dict = Depends(get_current_user)):
    """Junta mais sócios a uma mesa já aberta, registando a rodada em que entraram."""
    table = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Rodada não encontrada")
    if table.get("status") != "open":
        raise HTTPException(status_code=400, detail="Esta Rodada Mista já está fechada")
    current = table.get("members") or []
    known = {m["client_id"] for m in current}
    ids = [i for i in dict.fromkeys(body.member_ids or []) if i not in known]
    if not ids:
        raise HTTPException(status_code=400, detail="Escolhe pelo menos um sócio novo para a mesa")
    docs = await db.clients.find({"id": {"$in": ids}}, {"_id": 0, "pin_hash": 0}).to_list(len(ids))
    by_id = {d["id"]: d for d in docs}
    if any(i not in by_id for i in ids):
        raise HTTPException(status_code=404, detail="Sócio não encontrado")
    joined_round = len(table.get("rounds") or []) + 1
    now_iso = datetime.now(timezone.utc).isoformat()
    new_members = [{
        "client_id": by_id[i]["id"], "name": by_id[i]["name"],
        "member_number": by_id[i].get("member_number"),
        "joined_round": joined_round, "joined_at": now_iso,
    } for i in ids]
    await db.group_tables.update_one({"id": table_id}, {"$push": {"members": {"$each": new_members}}})
    for m in new_members:
        others = [f"{_group_member_ref(o)}" for o in current]
        companions = " e ".join(others) if len(others) <= 2 else f"{others[0]}, {others[1]} e mais {len(others) - 2} amigos"
        await db.socio_messages.insert_one({
            "id": str(uuid.uuid4()),
            "client_id": m["client_id"],
            "client_name": m["name"],
            "subject": "🍻 Juntaste-te à Rodada Mista",
            "message": f"Entraste na {table.get('label')} com {companions} (rodada {joined_round})! 🍻 Bebe com moderação.",
            "from_staff": True,
            "reply": None,
            "created_at": now_iso,
            "group_table_id": table_id,
        })
        await _mark_presence(m["client_id"], table_id)
    await _audit("group_table_add_members", user["email"], entity="group_table", entity_id=table_id,
                 summary=f"Rodada Mista {table.get('label')} · juntou {', '.join(m['name'] for m in new_members)} (rodada {joined_round})")
    updated = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    return updated


@api_router.post("/group-tables/{table_id}/rounds/{round_number}/settle")
async def settle_group_round(table_id: str, round_number: int, body: GroupRoundSettleIn,
                             user: dict = Depends(get_current_user)):
    """Rotação de pagadores: um sócio assume e liquida a rodada inteira."""
    table = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Rodada não encontrada")
    member_ids = {m["client_id"] for m in table.get("members") or []}
    if body.payer_client_id not in member_ids:
        raise HTTPException(status_code=400, detail="O pagador tem de ser um sócio da mesa")
    rnd = next((r for r in table.get("rounds") or [] if r.get("number") == round_number), None)
    if not rnd:
        raise HTTPException(status_code=404, detail="Rodada não encontrada")
    if rnd.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Esta rodada já foi paga")
    payer = await db.clients.find_one({"id": body.payer_client_id}, {"_id": 0, "pin_hash": 0})
    if not payer:
        raise HTTPException(status_code=404, detail="Sócio não encontrado")
    sale = await _group_sale(
        table, payer, "Rodada Mista (Oferecida à Mesa)", rnd["total"], rnd.get("items") or [], user, round_number,
    )
    pay = await _settle_group_sale(sale, (body.method or "account").lower(), user)
    await db.group_tables.update_one(
        {"id": table_id, "rounds.number": round_number},
        {"$set": {"rounds.$.status": "paid", "rounds.$.payer_client_id": body.payer_client_id,
                  "rounds.$.payer_name": payer["name"], "rounds.$.method": (body.method or "account").lower(),
                  "rounds.$.sale_id": sale["id"], "rounds.$.paid_at": datetime.now(timezone.utc).isoformat()}},
    )
    for m in table.get("members") or []:
        await _mark_presence(m["client_id"], table_id)
    table = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    table.pop("_id", None)
    return {"table": table, "sale": sale, "payment": pay}


@api_router.post("/group-tables/{table_id}/split")
async def split_group_table(table_id: str, body: GroupSplitIn, user: dict = Depends(get_current_user)):
    """Fecho da conta do grupo: partes iguais ou por consumo real de cada sócio."""
    table = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Rodada não encontrada")
    if table.get("status") != "open":
        raise HTTPException(status_code=400, detail="Esta Rodada Mista já está fechada")
    open_rounds = _open_group_rounds(table)
    if not open_rounds:
        raise HTTPException(status_code=400, detail="Não há rodadas por liquidar")
    members = table.get("members") or []
    n = len(members)
    total = round(sum(float(r.get("total") or 0) for r in open_rounds), 2)
    detail_all = [it for r in open_rounds for it in (r.get("items") or [])]
    methods = body.methods or {}
    sales, payments = [], []
    mode = (body.mode or "equal").lower()

    if mode == "items":
        assigned = body.items_by_member or {}
        price_map = {}
        for it in detail_all:
            price_map[it["product_id"]] = float(it.get("unit_price") or 0)
        plans = []
        assigned_total = 0.0
        for m in members:
            rows = assigned.get(m["client_id"]) or []
            detail = []
            for row in rows:
                qty = int(row.get("quantity") or 0)
                pid = row.get("product_id")
                if qty <= 0 or pid not in price_map:
                    continue
                name = next((it["product_name"] for it in detail_all if it["product_id"] == pid), pid)
                detail.append({"product_id": pid, "product_name": name, "unit_price": price_map[pid],
                               "quantity": qty, "subtotal": round(price_map[pid] * qty, 2)})
            subtotal = round(sum(d["subtotal"] for d in detail), 2)
            if subtotal > 0:
                plans.append((m, subtotal, detail))
                assigned_total += subtotal
        if not plans:
            raise HTTPException(status_code=400, detail="Atribui os consumos aos sócios da mesa")
        if abs(assigned_total - total) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Faltam consumos por atribuir: {total - assigned_total:.2f} € de {total:.2f} €",
            )
        for i, (m, subtotal, detail) in enumerate(plans):
            client_doc = await db.clients.find_one({"id": m["client_id"]}, {"_id": 0, "pin_hash": 0})
            if not client_doc:
                continue
            label = f"Rodada Mista (Partilha {i + 1}/{len(plans)})"
            sale = await _group_sale(table, client_doc, label, subtotal, detail, user)
            pay = await _settle_group_sale(sale, (methods.get(m["client_id"]) or "account").lower(), user)
            sales.append(sale)
            if pay:
                payments.append(pay)
    else:
        share = round(total / n, 2)
        for i, m in enumerate(members):
            subtotal = share if i < n - 1 else round(total - share * (n - 1), 2)
            if subtotal <= 0:
                continue
            client_doc = await db.clients.find_one({"id": m["client_id"]}, {"_id": 0, "pin_hash": 0})
            if not client_doc:
                continue
            label = f"Rodada Mista (Partilha {i + 1}/{n})"
            sale = await _group_sale(table, client_doc, label, subtotal, detail_all, user)
            pay = await _settle_group_sale(sale, (methods.get(m["client_id"]) or "account").lower(), user)
            sales.append(sale)
            if pay:
                payments.append(pay)

    for m in members:
        await _mark_presence(m["client_id"], table_id)
    # Todas as rodadas em aberto ficam liquidadas pela divisão da conta
    now_iso = datetime.now(timezone.utc).isoformat()
    rounds = table.get("rounds") or []
    for r in rounds:
        if r.get("status") != "paid":
            r["status"] = "paid"
            r["method"] = "split"
            r["paid_at"] = now_iso
    await db.group_tables.update_one(
        {"id": table_id},
        {"$set": {"status": "closed", "closed_at": now_iso, "rounds": rounds,
                  "split_mode": mode, "split_sale_ids": [s["id"] for s in sales]}},
    )
    await _audit("group_table_split", user["email"], entity="group_table", entity_id=table_id,
                 summary=f"Rodada Mista {table.get('label')} dividida ({'partes iguais' if mode == 'equal' else 'por consumo'}) · {total:.2f} €")
    updated = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    return {"table": updated, "sales": sales, "payments": payments}


@api_router.post("/group-tables/{table_id}/close")
async def close_group_table(table_id: str, user: dict = Depends(get_current_user)):
    table = await db.group_tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Rodada não encontrada")
    if _open_group_rounds(table):
        raise HTTPException(status_code=400, detail="Ainda há rodadas por liquidar nesta mesa")
    await db.group_tables.update_one({"id": table_id}, {"$set": {"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}


async def _presence_overview(client_id: str, month: Optional[str] = None) -> dict:
    """Calendário do mês + streak + recompensa a seguir + aviso de progresso de hoje."""
    await _settle_streak_rewards(client_id)
    today = _lisbon_today()
    ym = month if month and len(month) == 7 else today.strftime("%Y-%m")
    all_dates = await _presence_dates(client_id)
    month_dates = sorted(d for d in all_dates if d.startswith(ym))
    docs = await db.presences.find(
        {"client_id": client_id, "date": {"$regex": f"^{ym}"}}, {"_id": 0}
    ).to_list(400)
    streak = _streak_from_dates(all_dates)
    next_day = _next_streak_reward(streak)
    qs = await _quota_overall_status(client_id)
    status = (qs or {}).get("status")
    popup_doc = await db.presences.find_one(
        {"client_id": client_id, "date": today.isoformat(), "popup_seen": False}, {"_id": 0}
    )
    popup = None
    if popup_doc:
        nxt = _next_streak_reward(popup_doc.get("streak") or 0)
        popup = {
            "date": popup_doc["date"],
            "streak": popup_doc.get("streak") or 0,
            "next_reward_day": nxt,
            "days_to_next": (nxt - (popup_doc.get("streak") or 0)) if nxt else 0,
            "reward_points": popup_doc.get("reward_points") or 0,
            "reward_status": popup_doc.get("reward_status") or "none",
        }
    return {
        "month": ym,
        "days": month_dates,
        "today": today.isoformat(),
        "today_marked": today.isoformat() in all_dates,
        "streak": streak,
        "best_streak_month": _best_streak(set(month_dates)),
        "next_reward_day": next_day,
        "days_to_next": (next_day - streak) if next_day else 0,
        "rewards": [{"day": d, "points": p} for d, p in sorted(STREAK_REWARDS.items())],
        "month_presences": len(month_dates),
        # Selo do parceiro local nos dias em que a presença veio de um talão
        "partner_days": {d["date"]: (d.get("partner_emoji") or "🤝") for d in docs if d.get("partner_id")},
        "month_points": sum(int(d.get("points_applied") or 0) for d in docs),
        "quota_status": status,
        "points_blocked": status in ("pending", "debt"),
        "popup": popup,
    }


@api_router.get("/socio/presences")
async def my_presences(month: Optional[str] = None, socio: dict = Depends(get_current_socio)):
    return await _presence_overview(socio["id"], month)


@api_router.post("/socio/presences/seen")
async def mark_presence_popup_seen(socio: dict = Depends(get_current_socio)):
    """O sócio fechou o pop-up de progresso — não volta a aparecer."""
    await db.presences.update_many(
        {"client_id": socio["id"], "popup_seen": False},
        {"$set": {"popup_seen": True}},
    )
    return {"ok": True}


@api_router.get("/clients/{client_id}/presences")
async def client_presences(client_id: str, month: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Consulta do staff: calendário de presenças do sócio."""
    return await _presence_overview(client_id, month)


# ---------- Tabela de Feitos · rankings da associativa ----------
# Alcoólicas e não alcoólicas contam unidades consumidas e pagas no mês corrente;
# os rankings de consumo reiniciam no dia 1 e o histórico fica guardado em
# `db.ranking_awards` (badges/medalhas mensais mostradas no perfil).
RANK_ALCOHOL_CATEGORIES = {"Cerveja", "Vinho", "Licor", "Licores", "Espirituosa", "Espirituosas",
                           "Aguardente", "Bebidas Alcoólicas"}
RANK_SOFT_CATEGORIES = {"Água", "Aguas", "Sumo", "Sumos", "Refrigerante", "Refrigerantes",
                        "Café", "Cafe", "Energética", "Energetica", "Chá", "Cha", "Bebidas Não Alcoólicas"}
RANK_BADGES = {1: "🏆 Lenda da Nespereira", 2: "🥈 Vice do Balcão", 3: "🥉 Pódio da Sede",
               4: "🏅 Persistente", 5: "🏅 Top 5 Certificado"}


async def _rankings_enabled() -> bool:
    doc = await db.club_settings.find_one({"id": "rankings_enabled"}, {"_id": 0})
    return True if not doc else bool(doc.get("value", True))


def _rank_display(c: dict) -> str:
    if c.get("show_in_rankings") is False:
        return f"Anónimo (Sócio #{c.get('member_number') or '—'})"
    return c.get("name") or "—"


def _rank_rows(rows: list, key: str, label) -> list:
    ranked = sorted(
        [r for r in rows if r.get(key, 0) > 0],
        key=lambda r: (-r.get(key, 0), -r.get("days", 0), str(r.get("member_number") or "999999")),
    )[:5]
    return [{**r, "rank": i + 1, "badge": RANK_BADGES.get(i + 1), "value": r.get(key, 0)}
            for i, r in enumerate(ranked)]


async def _rankings_tables(year: int, month: int) -> dict:
    start = f"{year}-{month:02d}-01"
    end = f"{year + 1}-01-01" if month == 12 else f"{year}-{month + 1:02d}-01"
    products = {p["id"]: p for p in await db.products.find({}, {"_id": 0, "id": 1, "category": 1}).to_list(3000)}
    sales = await db.sales.find(
        {"created_at": {"$gte": start, "$lt": end}},
        {"_id": 0, "client_id": 1, "items": 1, "group_items": 1, "source": 1, "is_member_at_sale": 1},
    ).to_list(20000)
    agg: dict = {}
    for s in sales:
        if not s.get("is_member_at_sale") or s.get("source") == "quota":
            continue
        cid = s.get("client_id")
        if not cid:
            continue
        row = agg.setdefault(cid, {"alcohol": 0, "soft": 0})
        for it in (s.get("group_items") or s.get("items") or []):
            pid = it.get("product_id") or ""
            if pid.startswith("quota-") or pid.startswith("group-"):
                continue
            cat = (products.get(pid) or {}).get("category") or ""
            qty = int(it.get("quantity") or 0)
            if cat in RANK_ALCOHOL_CATEGORIES:
                row["alcohol"] += qty
            elif cat in RANK_SOFT_CATEGORIES:
                row["soft"] += qty
    presences = await db.presences.find(
        {"date": {"$gte": start, "$lt": end}}, {"_id": 0, "client_id": 1, "date": 1}
    ).to_list(20000)
    pdays: dict = {}
    for p in presences:
        pdays.setdefault(p["client_id"], set()).add(p["date"])
    ids = set(agg) | set(pdays)
    clients = {c["id"]: c for c in await db.clients.find(
        {"id": {"$in": list(ids)}}, {"_id": 0, "pin_hash": 0}
    ).to_list(len(ids) or 1)} if ids else {}
    rows = []
    for cid in ids:
        c = clients.get(cid)
        if not c or not c.get("is_member"):
            continue
        row = agg.get(cid, {"alcohol": 0, "soft": 0})
        days = pdays.get(cid, set())
        rows.append({
            "client_id": cid,
            "name": _rank_display(c),
            "member_number": c.get("member_number"),
            "alcohol": row["alcohol"],
            "soft": row["soft"],
            "consumptions": row["alcohol"] + row["soft"],
            "days": len(days),
            "streak": _best_streak(days),
        })

    # Badges do mês (atualização em tempo real ao servir um pedido)
    top_consumption = sorted(
        [r for r in rows if r["consumptions"] > 0],
        key=lambda r: (-r["consumptions"], -r["days"], str(r.get("member_number") or "999999")),
    )[:5]
    now_iso = datetime.now(timezone.utc).isoformat()
    for i, r in enumerate(top_consumption):
        await db.ranking_awards.update_one(
            {"year": year, "month": month, "client_id": r["client_id"]},
            {"$set": {
                "id": f"{year}-{month:02d}-{r['client_id']}", "year": year, "month": month,
                "client_id": r["client_id"], "rank": i + 1, "label": RANK_BADGES.get(i + 1),
                "consumptions": r["consumptions"], "days": r["days"], "updated_at": now_iso,
            }},
            upsert=True,
        )
    awards = await db.ranking_awards.find({}, {"_id": 0}).to_list(5000)
    medal_map: dict = {}
    for a in awards:
        medal_map.setdefault(a["client_id"], []).append(a)
    for r in rows:
        medals = sorted(medal_map.get(r["client_id"], []), key=lambda a: (a.get("year", 0), a.get("month", 0)), reverse=True)
        r["medals"] = len(medals)
        r["medal_list"] = [
            {"year": a.get("year"), "month": a.get("month"), "rank": a.get("rank"),
             "label": a.get("label"), "month_label": f"{MONTHS_FULL_PT[int(a.get('month', 1)) - 1]} {a.get('year')}"}
            for a in medals
        ]
    for r in rows:
        r.pop("alcohol_units", None)
    return {
        "year": year,
        "month": month,
        "month_label": f"{MONTHS_FULL_PT[month - 1]} {year}",
        "tables": {
            "medals": [{**r, "rank": i + 1, "value": r["medals"],
                        "value_label": f"{r['medals']} medalha{'s' if r['medals'] != 1 else ''}"}
                       for i, r in enumerate(sorted(
                           [r for r in rows if r["medals"] > 0],
                           key=lambda r: (-r["medals"], str(r.get("member_number") or "999999")),
                       )[:5])],
            "streak": [{**r, "value_label": f"{r['streak']} dia{'s' if r['streak'] != 1 else ''} seguido{'s' if r['streak'] != 1 else ''} · {r['days']} presença{'s' if r['days'] != 1 else ''}"}
                       for r in _rank_rows(rows, "streak", None)],
            "alcohol": [{**r, "value_label": f"{r['alcohol']} consumo{'s' if r['alcohol'] != 1 else ''}"} for r in _rank_rows(rows, "alcohol", None)],
            "nonalcohol": [{**r, "value_label": f"{r['soft']} consumo{'s' if r['soft'] != 1 else ''}"} for r in _rank_rows(rows, "soft", None)],
        },
    }


@api_router.get("/rankings")
async def staff_rankings(user: dict = Depends(get_current_user)):
    """Consulta do staff (direção/balcão) — sempre disponível."""
    today = _lisbon_today()
    data = await _rankings_tables(today.year, today.month)
    return {"enabled": await _rankings_enabled(), **data}


class RankingsSettingsIn(BaseModel):
    enabled: bool


@api_router.get("/rankings/settings")
async def get_rankings_settings(user: dict = Depends(get_current_user)):
    return {"enabled": await _rankings_enabled()}


@api_router.put("/rankings/settings")
async def set_rankings_settings(body: RankingsSettingsIn, user: dict = Depends(require_role("admin"))):
    await db.club_settings.update_one(
        {"id": "rankings_enabled"},
        {"$set": {"id": "rankings_enabled", "value": bool(body.enabled),
                  "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": user["email"]}},
        upsert=True,
    )
    await _audit("rankings_settings", user["email"], entity="club_settings", entity_id="rankings_enabled",
                 summary=f"Rankings {'ativados' if body.enabled else 'desativados'}")
    return {"enabled": bool(body.enabled)}


class SocioPrivacyIn(BaseModel):
    show_in_rankings: bool


@api_router.put("/socio/privacy")
async def socio_privacy(body: SocioPrivacyIn, socio: dict = Depends(get_current_socio)):
    await db.clients.update_one(
        {"id": socio["id"]}, {"$set": {"show_in_rankings": bool(body.show_in_rankings)}}
    )
    return {"show_in_rankings": bool(body.show_in_rankings)}


@api_router.get("/socio/rankings")
async def socio_rankings(socio: dict = Depends(get_current_socio)):
    """Tabela de Feitos na App Sócio — só para cotas em dia (🟢)."""
    badges = await db.ranking_awards.find(
        {"client_id": socio["id"]}, {"_id": 0}
    ).sort([("year", -1), ("month", -1)]).to_list(50)
    my_badge = None
    if badges:
        b = badges[0]
        my_badge = {**b, "month_label": f"{MONTHS_FULL_PT[int(b.get('month', 1)) - 1]} {b.get('year')}"}
    enabled = await _rankings_enabled()
    if not enabled:
        return {"enabled": False, "allowed": False, "my_badge": my_badge,
                "reason": "Os rankings estão desativados pela direção."}
    qs = await _quota_overall_status(socio["id"])
    if not qs or qs.get("status") != "paid":
        return {"enabled": True, "allowed": False, "my_badge": my_badge, "quota_status": qs,
                "reason": "A Tabela de Feitos é exclusiva para sócios com quotas em dia. Regulariza as tuas quotas para consultar os rankings."}
    today = _lisbon_today()
    data = await _rankings_tables(today.year, today.month)
    return {"enabled": True, "allowed": True, "my_badge": my_badge,
            "show_in_rankings": socio.get("show_in_rankings") is not False, **data}


# ---------- Conquistas · medalhas de perfil ----------
# Medalhas cômicas/prestigiantes calculadas a partir do histórico real do sócio
# (vendas, presenças, rodadas e cotas). Sem dados suficientes ficam bloqueadas.
BADGE_DEFS = [
    {"code": "bifana", "emoji": "🍞", "name": "O Homem da Bifana",
     "description": "Consumiu 10 bifanas no bar durante o mês.", "target": 10, "unit": "bifanas este mês"},
    {"code": "trunfo", "emoji": "🎴", "name": "Mestre do Trunfo",
     "description": "Participou num torneio de Sueca na sede.", "target": 1, "unit": "torneios"},
    {"code": "guardiao", "emoji": "👑", "name": "O Guardião",
     "description": "Alcançou um streak de 31 dias de presenças seguidas.", "target": 31, "unit": "dias seguidos"},
    {"code": "terror_minis", "emoji": "🍺", "name": "O Terror das Minis",
     "description": "Bebeste 50 minis num único mês. O balcão até já treme quando chegas!", "target": 50, "unit": "minis no melhor mês"},
    {"code": "combustivel", "emoji": "🥖", "name": "Combustível de Nespereira",
     "description": "Pediste 5 bifanas + 5 imperiais no mesmo fim de semana. A verdadeira dieta dos campeões.", "target": 5, "unit": "pares no melhor fim de semana"},
    {"code": "cafeinomano", "emoji": "☕", "name": "Cafeinómano Assíduo",
     "description": "Bebe mais de 2 cafés por dia na sede durante 7 dias seguidos.", "target": 7, "unit": "dias seguidos"},
    {"code": "bagaco", "emoji": "🍷", "name": "Provador de Bagaço",
     "description": "Consumiu a primeira bebida do dia logo na abertura do bar por 3 vezes no mesmo mês.", "target": 3, "unit": "manhãs este mês"},
    {"code": "lord_rodada", "emoji": "💸", "name": "O Lord da Rodada",
     "description": "Pagaste uma rodada mista a 5 ou mais sócios de uma assentada. Hoje paga o patrão!", "target": 5, "unit": "sócios servidos"},
    {"code": "especial_one", "emoji": "🦅", "name": "O Especial One",
     "description": "Mantiveste as quotas regularizadas 🟢 durante 12 meses consecutivos.", "target": 12, "unit": "meses seguidos"},
    {"code": "relojoeiro", "emoji": "⏰", "name": "Relojoeiro",
     "description": "Fizeste o registo de presença em 3 períodos diferentes do mesmo dia. Só faltou lá ir dormir.", "target": 3, "unit": "períodos no melhor dia"},
    {"code": "relampago", "emoji": "⚡", "name": "Sócio Relâmpago",
     "description": "Chegaste à sede 5 minutos depois de ser lançada uma notificação no bar.", "target": 1, "unit": "chegadas relâmpago"},
    {"code": "resgate", "emoji": "🚨", "name": "Resgate de Última Hora",
     "description": "Regularizaste a quota no 31.º dia para não entrar em dívida. Salvo pelo golo aos 90+4'!", "target": 1, "unit": "resgates"},
    {"code": "casado_solteiro", "emoji": "⚽", "name": "Casado vs. Solteiro",
     "description": "Jogaste no clássico anual de futebol da aldeia. Titular indiscutível do dérbi mais mítico de Nespereira!", "target": 1, "unit": "clássicos"},
    {"code": "honorario_ouro", "emoji": "👔", "name": "Sócio Honorário de Ouro",
     "description": "Definiste a quota anual voluntária num valor superior ao mínimo de 20 €.", "target": 1, "unit": "quota anual"},
    {"code": "padrinho", "emoji": "🤝", "name": "Padrinho Associativo",
     "description": "Convidaste ou inscreveste 3 novos sócios tutelados ou amigos na app.", "target": 3, "unit": "sócios trazidos"},
]

_TZ_LISBOA = None


def _tz_lisboa():
    global _TZ_LISBOA
    if _TZ_LISBOA is None:
        try:
            from zoneinfo import ZoneInfo
            _TZ_LISBOA = ZoneInfo("Europe/Lisbon")
        except Exception:
            _TZ_LISBOA = timezone.utc
    return _TZ_LISBOA


def _sale_events(sales: list) -> list:
    """(data local, nome do produto em minúsculas, quantidade) por linha de venda."""
    events = []
    for s in sales:
        try:
            dt = datetime.fromisoformat(str(s.get("created_at")).replace("Z", "+00:00")).astimezone(_tz_lisboa())
        except Exception:
            continue
        for it in (s.get("group_items") or s.get("items") or []):
            name = (it.get("product_name") or "").lower()
            qty = int(it.get("quantity") or 0)
            if name and qty > 0:
                events.append((dt, name, qty))
    events.sort(key=lambda e: e[0])
    return events


def _max_in_month(events: list, hints: tuple) -> int:
    """Maior total de unidades (que correspondem a `hints`) num único mês."""
    per_month: dict = {}
    for dt, name, qty in events:
        if any(h in name for h in hints):
            key = f"{dt.year}-{dt.month:02d}"
            per_month[key] = per_month.get(key, 0) + qty
    return max(per_month.values()) if per_month else 0


def _best_streak_of_days(days: set) -> int:
    best = run = 0
    prev = None
    for day in sorted(days):
        run = run + 1 if prev and (day - prev).days == 1 else 1
        best = max(best, run)
        prev = day
    return best


async def _event_participation(client_id: str, kinds: tuple) -> int:
    """Participações em eventos/torneios registados pela direção (db.events)."""
    docs = await db.events.find({"kind": {"$in": list(kinds)}}, {"_id": 0}).to_list(2000)
    total = 0
    for d in docs:
        people = d.get("participants") or d.get("participant_ids") or []
        if any((p if isinstance(p, str) else (p or {}).get("client_id")) == client_id for p in people):
            total += 1
    return total


async def _badges_for(client_id: str) -> list:
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "pin_hash": 0}) or {}
    sales = await db.sales.find({"client_id": client_id}, {"_id": 0, "created_at": 1, "items": 1, "group_items": 1}).to_list(5000)
    events = _sale_events(sales)
    presences = await db.presences.find({"client_id": client_id}, {"_id": 0, "date": 1, "created_at": 1}).to_list(5000)
    presence_days = set()
    for p in presences:
        try:
            presence_days.add(datetime.strptime(p["date"], "%Y-%m-%d").date())
        except Exception:
            pass
    quotas = await db.quotas.find({"client_id": client_id, "reversed": {"$ne": True}}, {"_id": 0}).to_list(400)
    tables = await db.group_tables.find({"members.client_id": client_id}, {"_id": 0, "members": 1, "rounds": 1}).to_list(200)

    today = _lisbon_today()
    month_key = f"{today.year}-{today.month:02d}"
    metrics: dict = {}

    # 🍞 bifanas no mês corrente
    metrics["bifana"] = sum(q for dt, name, q in events if "bifana" in name and f"{dt.year}-{dt.month:02d}" == month_key)

    # 🎴 torneio de Sueca
    metrics["trunfo"] = await _event_participation(client_id, ("sueca", "torneio", "trunfo"))

    # 👑 melhor streak de presenças de sempre
    metrics["guardiao"] = _best_streak_of_days(presence_days)

    # 🍺 minis no melhor mês
    metrics["terror_minis"] = _max_in_month(events, ("mini",))

    # 🥖 bifanas + imperiais no mesmo fim de semana
    per_weekend: dict = {}
    for dt, name, qty in events:
        if dt.weekday() not in (5, 6):
            continue
        key = f"{dt.isocalendar()[0]}-{dt.isocalendar()[1]}"
        bucket = per_weekend.setdefault(key, {"bifana": 0, "imperial": 0})
        if "bifana" in name:
            bucket["bifana"] += qty
        if "imperial" in name:
            bucket["imperial"] += qty
    metrics["combustivel"] = max((min(b["bifana"], b["imperial"]) for b in per_weekend.values()), default=0)

    # ☕ 7 dias seguidos com mais de 2 cafés
    coffee_days: dict = {}
    for dt, name, qty in events:
        if "caf" in name:
            coffee_days[dt.date()] = coffee_days.get(dt.date(), 0) + qty
    metrics["cafeinomano"] = _best_streak_of_days({d for d, q in coffee_days.items() if q >= 3})

    # 🍷 primeira bebida do dia antes do meio-dia
    first_of_day: dict = {}
    for dt, name, qty in events:
        first_of_day.setdefault(dt.date(), dt)
    metrics["bagaco"] = sum(
        1 for day, dt in first_of_day.items()
        if dt.hour < 12 and f"{day.year}-{day.month:02d}" == month_key
    )

    # 💸 pagou uma rodada a 5+ sócios
    lord = 0
    for t in tables:
        paid_by_me = any(r.get("status") == "paid" and r.get("payer_client_id") == client_id for r in (t.get("rounds") or []))
        if paid_by_me:
            lord = max(lord, max(len(t.get("members") or []) - 1, 0))
    metrics["lord_rodada"] = lord

    # 🦅 12 meses consecutivos com quotas pagas
    paid_months = set()
    for q in quotas:
        if q.get("status") != "paid":
            continue
        try:
            paid_months.add((int(q["year"]), int(q["month"])))
        except (KeyError, TypeError, ValueError):
            continue
    best_run = run = 0
    cursor = (today.year, today.month)
    for _ in range(36):
        if cursor in paid_months:
            run += 1
            best_run = max(best_run, run)
        else:
            run = 0
        cursor = (cursor[0] - 1, 12) if cursor[1] == 1 else (cursor[0], cursor[1] - 1)
    metrics["especial_one"] = best_run

    # ⏰ 3 períodos diferentes no mesmo dia
    periods: dict = {}
    for dt, _name, _qty in events:
        block = "manha" if dt.hour < 12 else ("tarde" if dt.hour < 19 else "noite")
        periods.setdefault(dt.date(), set()).add(block)
    metrics["relojoeiro"] = max((len(v) for v in periods.values()), default=0)

    # ⚡ presença nos 5 minutos seguintes a uma notificação do bar
    staff_msgs = await db.socio_messages.find({"from_staff": True}, {"_id": 0, "created_at": 1}).to_list(2000)
    msg_times = []
    for m in staff_msgs:
        try:
            msg_times.append(datetime.fromisoformat(str(m.get("created_at")).replace("Z", "+00:00")))
        except Exception:
            continue
    msg_times.sort()
    lightning = 0
    for p in presences:
        try:
            when = datetime.fromisoformat(str(p.get("created_at")).replace("Z", "+00:00"))
        except Exception:
            continue
        if any(timedelta(0) <= (when - t) <= timedelta(minutes=5) for t in msg_times):
            lightning += 1
    metrics["relampago"] = lightning

    # 🚨 quota paga no último dia do mês
    rescues = 0
    for q in quotas:
        if q.get("status") != "paid":
            continue
        paid_at = q.get("paid_at") or q.get("updated_at")
        try:
            when = datetime.fromisoformat(str(paid_at).replace("Z", "+00:00")).astimezone(_tz_lisboa())
            last_day = calendar.monthrange(int(q["year"]), int(q["month"]))[1]
            if when.day == last_day:
                rescues += 1
        except Exception:
            continue
    metrics["resgate"] = rescues

    # ⚽ clássico de futebol
    metrics["casado_solteiro"] = await _event_participation(client_id, ("futebol", "classico", "derbi"))

    # 👔 quota anual voluntária acima de 20 €
    annual = float(client.get("honorary_annual_value") or 0)
    metrics["honorario_ouro"] = 1 if (client.get("is_honorary") and annual > 20) else 0

    # 🤝 novos sócios trazidos
    metrics["padrinho"] = await db.clients.count_documents({"referred_by": client_id})

    out = []
    for d in BADGE_DEFS:
        current = int(metrics.get(d["code"]) or 0)
        out.append({
            **d,
            "current": current,
            "unlocked": current >= d["target"],
            "progress_pct": min(100, int(round(current * 100 / d["target"]))) if d["target"] else 100,
        })
    return out


@api_router.get("/socio/badges")
async def socio_badges(socio: dict = Depends(get_current_socio)):
    badges = await _badges_for(socio["id"])
    return {"badges": badges, "unlocked": sum(1 for b in badges if b["unlocked"]), "total": len(badges)}


@api_router.get("/clients/{client_id}/badges")
async def client_badges(client_id: str, user: dict = Depends(get_current_user)):
    """Consulta do staff — medalhas desbloqueadas pelo sócio."""
    badges = await _badges_for(client_id)
    return {"badges": badges, "unlocked": sum(1 for b in badges if b["unlocked"]), "total": len(badges)}


# ---------- Parceiros locais · upload de ticket ----------
PARTNER_TICKET_DAILY_LIMIT = 3
PARTNER_TICKET_MAX_HOURS = 48


class PartnerIn(BaseModel):
    name: str
    emoji: Optional[str] = None
    active: bool = True
    points_per_5eur: float = 0.5
    note: Optional[str] = None


class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    active: Optional[bool] = None
    points_per_5eur: Optional[float] = None
    note: Optional[str] = None


class PartnerTicketIn(BaseModel):
    partner_id: str
    amount: float
    purchase_date: str  # AAAA-MM-DD (data do talão)
    doc_number: Optional[str] = None
    photo_data: Optional[str] = None  # data URL base64 da fotografia do talão
    note: Optional[str] = None


class PartnerTicketReject(BaseModel):
    reason: Optional[str] = None


async def _active_partners() -> list:
    return await db.partners.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(100)


@api_router.get("/partners")
async def list_partners(user: dict = Depends(get_current_user)):
    return await db.partners.find({}, {"_id": 0}).sort("name", 1).to_list(100)


@api_router.post("/partners")
async def create_partner(body: PartnerIn, user: dict = Depends(require_role("admin"))):
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "emoji": (body.emoji or "🤝").strip()[:4],
        "active": bool(body.active),
        "points_per_5eur": float(body.points_per_5eur or 0),
        "note": body.note,
        "created_at": now_iso,
    }
    if not doc["name"]:
        raise HTTPException(status_code=400, detail="Indica o nome do parceiro")
    await db.partners.insert_one(doc)
    await _audit("partner_create", user["email"], entity="partner", entity_id=doc["id"],
                 summary=f"Parceiro local criado · {doc['name']}")
    doc.pop("_id", None)
    return doc


@api_router.put("/partners/{partner_id}")
async def update_partner(partner_id: str, body: PartnerUpdate, user: dict = Depends(require_role("admin"))):
    partner = await db.partners.find_one({"id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Parceiro não encontrado")
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "name" in patch:
        patch["name"] = patch["name"].strip()
        if not patch["name"]:
            raise HTTPException(status_code=400, detail="Indica o nome do parceiro")
    if patch:
        await db.partners.update_one({"id": partner_id}, {"$set": patch})
    if "active" in patch and patch["active"] != partner.get("active"):
        await _audit("partner_toggle", user["email"], entity="partner", entity_id=partner_id,
                     summary=f"Parceria '{partner.get('name')}' {'ativada' if patch['active'] else 'desativada'} na app do sócio")
    return await db.partners.find_one({"id": partner_id}, {"_id": 0})


@api_router.delete("/partners/{partner_id}")
async def delete_partner(partner_id: str, user: dict = Depends(require_role("admin"))):
    partner = await db.partners.find_one({"id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Parceiro não encontrado")
    await db.partners.delete_one({"id": partner_id})
    await _audit("partner_delete", user["email"], entity="partner", entity_id=partner_id,
                 summary=f"Parceiro local removido · {partner.get('name')}")
    return {"ok": True}


async def _notify_partner_ticket(ticket: dict, subject: str, message: str) -> None:
    """Notificação no sino do portal do sócio (aceite/rejeitado de um talão)."""
    await db.socio_messages.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": ticket["client_id"],
        "client_name": ticket.get("client_name"),
        "subject": subject,
        "message": message,
        "from_staff": True,
        "reply": None,
        "partner_ticket_id": ticket["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _award_partner_ticket(ticket: dict, by: str) -> dict:
    """Credita o benefício: pontos (só com quotas 🟢) + presença do dia."""
    partner = await db.partners.find_one({"id": ticket["partner_id"]}, {"_id": 0}) or {}
    per_5 = float(partner.get("points_per_5eur") or 0)
    qs = await _quota_overall_status(ticket["client_id"])
    eligible = bool(qs and qs.get("status") == "paid")
    earned_units = int(float(ticket["amount"]) // 5.01) if eligible else 0
    earned = round(earned_units * per_5, 2)
    client = await db.clients.find_one({"id": ticket["client_id"]}, {"_id": 0, "partner_points_carry": 1}) or {}
    carry = round(float(client.get("partner_points_carry") or 0) + earned, 2)
    whole = int(carry)
    carry = round(carry - whole, 2)
    if whole > 0:
        await db.clients.update_one({"id": ticket["client_id"]}, {"$inc": {"points": whole}})
        await _log_points(ticket["client_id"], whole, "partner_ticket", ticket["id"],
                          f"Talão {partner.get('name')} · {ticket['amount']:.2f} €", by)
    await db.clients.update_one({"id": ticket["client_id"]}, {"$set": {"partner_points_carry": carry}})
    carry_delta = round(earned - whole, 2)
    # Presença do dia com o selo do parceiro (mantém o streak mesmo com o bar fechado)
    presence = await _mark_presence(ticket["client_id"], None, "partner_ticket")
    if presence:
        await db.presences.update_one(
            {"id": presence["id"]},
            {"$set": {"partner_id": partner.get("id"), "partner_name": partner.get("name"),
                      "partner_emoji": partner.get("emoji") or "🤝"}},
        )
    await db.partner_tickets.update_one(
        {"id": ticket["id"]},
        {"$set": {"status": "validated", "points_awarded": whole, "quota_eligible": eligible,
                  "points_carry_delta": carry_delta, "presence_id": presence["id"] if presence else None,
                  "presence_granted": bool(presence), "points_reverted": False,
                  "validated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await _audit("partner_ticket_validated", by, entity="partner_ticket", entity_id=ticket["id"],
                 summary=f"Talão {partner.get('name')} validado · {ticket['client_name']} · "
                         f"{ticket['amount']:.2f} € · +{whole} ponto(s)"
                         + ("" if eligible else " · cotas não regularizadas (sem pontos)"))
    if whole > 0:
        benefit = f"Ganhaste {whole} ponto(s)."
    elif eligible:
        benefit = "O valor não chegou aos 5 €, por isso não gerou pontos."
    else:
        benefit = "As tuas quotas não estão em dia (🔴), por isso o talão não gerou pontos."
    await _notify_partner_ticket(
        ticket,
        f"✅ Talão aceite · {partner.get('name')}",
        f"O teu talão de {ticket['amount']:.2f} € na {partner.get('name')} foi aceite"
        f"{' automaticamente pela leitura do talão' if by.startswith('sistema') else ' pela direção'}. "
        f"{benefit} Presença de hoje registada.",
    )
    return await db.partner_tickets.find_one({"id": ticket["id"]}, {"_id": 0})


# ---------- Leitura automática do talão (IA) ----------
# O talão nunca é validado por confiança no que o sócio escreveu: a leitura da
# fotografia tem de identificar o parceiro, a data e o valor. Mesmo assim, a
# direção pode anular a entrada e os pontos atribuídos são retirados.
PARTNER_TICKET_AI_PROMPT = (
    "Analisas a fotografia de um talão de compra de um parceiro local da ARDN. "
    "Responde APENAS com JSON válido, sem texto à volta, com as chaves: "
    '{"readable": true|false, "partner": "<nome do estabelecimento impresso>"|null, '
    '"purchase_date": "AAAA-MM-DD"|null, "amount": <total pago em euros>|null, '
    '"doc_number": "<número do talão>"|null}. '
    "Não inventes: se um campo não estiver legível com segurança, devolve null."
)


def _ai_norm(value) -> str:
    import unicodedata
    txt = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("utf-8")
    return " ".join(txt.lower().split())


def _ai_amount(value) -> Optional[float]:
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    txt = str(value or "").replace("€", "").replace(" ", "").replace(",", ".")
    try:
        return round(float(txt), 2)
    except ValueError:
        return None


def _ai_date(value) -> Optional[str]:
    txt = str(value or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(txt, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _ai_match_partner(reading: Optional[str], partners: list) -> Optional[dict]:
    """Encontra o parceiro registado cujo nome aparece no talão lido pela IA."""
    name = _ai_norm(reading)
    if not name:
        return None
    for partner in partners:
        other = _ai_norm(partner.get("name"))
        if not other:
            continue
        if name == other or (len(other) >= 4 and other in name) or (len(name) >= 4 and name in other):
            return partner
    return None


def _ticket_ai_read(api_key: str, model: str, photo_data: str) -> dict:
    """Lê a fotografia do talão com a Gemini (visão) e devolve o JSON identificado."""
    import json as _json
    import urllib.request

    header, _, b64 = (photo_data or "").partition(",")
    mime = "image/jpeg"
    if header.startswith("data:") and ";" in header:
        mime = header[5:header.index(";")] or mime
    if not b64:
        raise ValueError("fotografia do talão inválida")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = _json.dumps({
        "contents": [{"role": "user", "parts": [
            {"text": PARTNER_TICKET_AI_PROMPT},
            {"inline_data": {"mime_type": mime, "data": b64}},
        ]}],
        # O modelo gasta parte dos tokens a "pensar": abaixo disto o JSON sai truncado.
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "maxOutputTokens": 2048},
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = _json.loads(resp.read().decode("utf-8", "replace"))
    parts = (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts")) or []
    raw = "".join(p.get("text", "") for p in parts).strip()
    if not raw:
        return {}
    start, end = raw.find("{"), raw.rfind("}")
    return _json.loads(raw[start:end + 1]) if start >= 0 and end > start else {}


async def _ai_check_partner_ticket(ticket_id: str, auto_award: bool = False) -> Optional[dict]:
    """Lê o talão e guarda o resultado em `ai_check`. Com `auto_award`, aceita o
    talão automaticamente quando parceiro, data e valor coincidem com a submissão."""
    ticket = await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        return None
    if ticket.get("status") != "pending":
        return ticket.get("ai_check")
    api_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    check = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "model": ASSISTANT_MODEL,
        "readable": None,
        "partner": None,
        "purchase_date": None,
        "amount": None,
        "doc_number": None,
        "matched_partner_id": None,
        "matched_partner_name": None,
        "match": {"partner": False, "date": False, "amount": False},
        "confident": False,
        "error": None,
    }
    if not api_key:
        check["error"] = "Leitura automática indisponível (falta a chave da IA)"
    elif not ticket.get("photo_data"):
        check["error"] = "Talão enviado sem fotografia"
    else:
        try:
            data = await asyncio.to_thread(_ticket_ai_read, api_key, ASSISTANT_MODEL, ticket["photo_data"])
        except Exception as exc:
            logger.warning("Leitura automática do talão %s falhou: %s", ticket_id, exc)
            data = {}
            check["error"] = "Não foi possível ler o talão"
        if data:
            check["readable"] = data.get("readable") is not False
            check["partner"] = str(data.get("partner")).strip() if data.get("partner") else None
            check["purchase_date"] = _ai_date(data.get("purchase_date"))
            check["amount"] = _ai_amount(data.get("amount"))
            check["doc_number"] = str(data.get("doc_number")).strip() if data.get("doc_number") else None
            partners = await db.partners.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
            matched = _ai_match_partner(check["partner"], partners)
            if matched:
                check["matched_partner_id"] = matched.get("id")
                check["matched_partner_name"] = matched.get("name")
            declared_amount = float(ticket.get("amount") or 0)
            check["match"] = {
                "partner": bool(matched) and matched.get("id") == ticket.get("partner_id"),
                "date": check["purchase_date"] == ticket.get("purchase_date"),
                "amount": check["amount"] is not None and abs(check["amount"] - declared_amount) <= 0.02,
            }
            check["confident"] = bool(check["readable"] and all(check["match"].values()))
        elif not check["error"]:
            check["error"] = "Não foi possível ler os campos do talão"
    await db.partner_tickets.update_one({"id": ticket_id}, {"$set": {"ai_check": check}})
    if auto_award and check["confident"] and not ticket.get("duplicate_of"):
        fresh = await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})
        if fresh and fresh.get("status") == "pending":
            await _award_partner_ticket(fresh, "sistema (leitura automática do talão)")
            await db.partner_tickets.update_one({"id": ticket_id}, {"$set": {"validation": "auto"}})
    return check


@api_router.get("/socio/partners")
async def socio_partners(socio: dict = Depends(get_current_socio)):
    return await _active_partners()


@api_router.get("/socio/partner-tickets")
async def socio_partner_tickets(socio: dict = Depends(get_current_socio)):
    tickets = await db.partner_tickets.find(
        {"client_id": socio["id"]}, {"_id": 0, "photo_data": 0}
    ).sort("submitted_at", -1).to_list(100)
    return tickets


@api_router.post("/socio/partner-tickets")
async def socio_submit_partner_ticket(body: PartnerTicketIn, background: BackgroundTasks,
                                     socio: dict = Depends(get_current_socio)):
    """Sócio envia a fotografia do talão de um parceiro local."""
    partner = await db.partners.find_one({"id": body.partner_id}, {"_id": 0})
    if not partner or not partner.get("active"):
        raise HTTPException(status_code=400, detail="Parceria indisponível")
    if float(body.amount or 0) <= 0:
        raise HTTPException(status_code=400, detail="Indica o valor do talão")
    try:
        purchase = datetime.strptime(body.purchase_date, "%Y-%m-%d")
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Indica a data do talão (AAAA-MM-DD)")
    now = datetime.now(timezone.utc)
    purchase_utc = purchase.replace(tzinfo=timezone.utc)
    if purchase_utc.date() > now.date():
        raise HTTPException(status_code=400, detail="A data do talão não pode ser no futuro")
    if now - purchase_utc > timedelta(hours=PARTNER_TICKET_MAX_HOURS):
        raise HTTPException(status_code=400,
                            detail=f"O talão tem de ser submetido nas {PARTNER_TICKET_MAX_HOURS}h seguintes à compra")
    today_prefix = now.astimezone(_tz_lisboa()).date().isoformat()
    sent_today = await db.partner_tickets.count_documents(
        {"client_id": socio["id"], "submitted_at": {"$gte": today_prefix + "T00:00:00"}}
    )
    if sent_today >= PARTNER_TICKET_DAILY_LIMIT:
        raise HTTPException(status_code=400,
                            detail=f"Limite de {PARTNER_TICKET_DAILY_LIMIT} talões por dia já atingido")
    doc_no = (body.doc_number or "").strip().upper()
    duplicate = None
    if doc_no:
        duplicate = await db.partner_tickets.find_one(
            {"doc_number": doc_no, "status": {"$ne": "rejected"}, "client_id": {"$ne": socio["id"]}},
            {"_id": 0, "client_name": 1, "submitted_at": 1},
        )
    now_iso = now.isoformat()
    ticket = {
        "id": str(uuid.uuid4()),
        "partner_id": partner["id"],
        "partner_name": partner.get("name"),
        "partner_emoji": partner.get("emoji") or "🤝",
        "client_id": socio["id"],
        "client_name": socio.get("name"),
        "member_number": socio.get("member_number"),
        "amount": round(float(body.amount), 2),
        "purchase_date": body.purchase_date,
        "doc_number": doc_no or None,
        "photo_data": body.photo_data,
        "note": body.note,
        "status": "pending",
        "validation": None,
        "duplicate_of": duplicate.get("client_name") if duplicate else None,
        "points_awarded": 0,
        "submitted_at": now_iso,
        "validated_by": None,
        "validated_at": None,
    }
    await db.partner_tickets.insert_one(ticket)
    if duplicate:
        await _audit("partner_ticket_duplicate", f"socio:{socio.get('member_number') or socio['id']}",
                     entity="partner_ticket", entity_id=ticket["id"],
                     summary=(f"Talão duplicado detetado · documento {doc_no} de {partner.get('name')} · "
                              f"enviado por {socio.get('name')} (já carregado por {duplicate.get('client_name')})"))
    # O talão fica SEMPRE pendente: quem valida e credita os pontos é a direção.
    # A leitura automática só aceita o talão quando identifica, na fotografia, o
    # parceiro, a data e o valor — e mesmo assim a entrada pode ser anulada depois.
    if body.photo_data:
        background.add_task(_ai_check_partner_ticket, ticket["id"], True)
    ticket.pop("_id", None)
    ticket.pop("photo_data", None)
    return ticket


@api_router.get("/partner-tickets")
async def list_partner_tickets(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {} if status_filter in (None, "", "all") else {"status": status_filter}
    return await db.partner_tickets.find(q, {"_id": 0}).sort("submitted_at", -1).to_list(300)


@api_router.get("/partner-tickets/pending-count")
async def partner_tickets_pending_count(user: dict = Depends(get_current_user)):
    """Contador leve para o aviso do cabeçalho do staff (talões à espera de validação)."""
    return {"pending": await db.partner_tickets.count_documents({"status": "pending"})}


@api_router.post("/partner-tickets/{ticket_id}/validate")
async def validate_partner_ticket(ticket_id: str, user: dict = Depends(require_role("admin", "tesoureiro"))):
    ticket = await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Talão não encontrado")
    if ticket.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Só talões pendentes podem ser validados")
    await _award_partner_ticket(ticket, user["email"])
    await db.partner_tickets.update_one({"id": ticket_id}, {"$set": {"validation": "manual", "validated_by": user["email"]}})
    return await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})


@api_router.post("/partner-tickets/{ticket_id}/ai-check")
async def check_partner_ticket(ticket_id: str, user: dict = Depends(require_role("admin", "tesoureiro"))):
    """Relê a fotografia do talão (parceiro, data e valor) sem validar nada."""
    ticket = await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Talão não encontrado")
    if ticket.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Só talões pendentes podem ser lidos")
    await _ai_check_partner_ticket(ticket_id, False)
    return await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})


@api_router.post("/partner-tickets/{ticket_id}/invalidate")
async def invalidate_partner_ticket(ticket_id: str, body: PartnerTicketReject,
                                    user: dict = Depends(require_role("admin", "tesoureiro"))):
    """Anula um talão já validado: retira os pontos, a fração acumulada e a presença."""
    ticket = await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Talão não encontrado")
    if ticket.get("status") != "validated":
        raise HTTPException(status_code=400, detail="Só talões validados podem ser anulados")
    awarded = int(ticket.get("points_awarded") or 0)
    if awarded:
        client = await db.clients.find_one({"id": ticket["client_id"]}, {"_id": 0, "points": 1}) or {}
        points = max(0, int(client.get("points") or 0) - awarded)
        await db.clients.update_one({"id": ticket["client_id"]}, {"$set": {"points": points}})
        await _log_points(ticket["client_id"], -awarded, "partner_ticket_invalidated", ticket_id,
                          f"Anulação do talão {ticket.get('partner_name')}", user["email"])
    carry_delta = float(ticket.get("points_carry_delta") or 0)
    if carry_delta:
        client = await db.clients.find_one({"id": ticket["client_id"]}, {"_id": 0, "partner_points_carry": 1}) or {}
        carry = max(0.0, round(float(client.get("partner_points_carry") or 0) - carry_delta, 2))
        await db.clients.update_one({"id": ticket["client_id"]}, {"$set": {"partner_points_carry": carry}})
    if ticket.get("presence_id"):
        await db.presences.delete_one({"id": ticket["presence_id"]})
    reason = (body.reason or "").strip() or None
    await db.partner_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"status": "invalidated", "invalidated_by": user["email"],
                  "invalidated_at": datetime.now(timezone.utc).isoformat(),
                  "invalidate_reason": reason, "points_reverted": bool(awarded)}},
    )
    await _audit("partner_ticket_invalidated", user["email"], entity="partner_ticket", entity_id=ticket_id,
                 summary=f"Talão de {ticket.get('client_name')} ({ticket.get('partner_name')}) anulado · "
                         f"{-awarded} ponto(s) retirados" + (f" · {reason}" if reason else ""))
    return await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})


@api_router.post("/partner-tickets/{ticket_id}/reject")
async def reject_partner_ticket(ticket_id: str, body: PartnerTicketReject,
                                user: dict = Depends(require_role("admin", "tesoureiro"))):
    ticket = await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Talão não encontrado")
    if ticket.get("status") == "validated":
        raise HTTPException(status_code=400, detail="Talão já validado - não pode ser rejeitado")
    await db.partner_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"status": "rejected", "reject_reason": (body.reason or "").strip() or None,
                  "validated_by": user["email"], "validated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await _audit("partner_ticket_rejected", user["email"], entity="partner_ticket", entity_id=ticket_id,
                 summary=f"Talão de {ticket.get('client_name')} ({ticket.get('partner_name')}) rejeitado"
                         + (f" · {body.reason.strip()}" if (body.reason or "").strip() else ""))
    reason = (body.reason or "").strip()
    await _notify_partner_ticket(
        ticket,
        f"❌ Talão rejeitado · {ticket.get('partner_name')}",
        f"O teu talão de {float(ticket.get('amount') or 0):.2f} € na {ticket.get('partner_name')} "
        "não foi aceite, por isso não foram atribuídos pontos."
        + (f" Motivo: {reason}." if reason else " Passa pela receção para mais informação."),
    )
    return await db.partner_tickets.find_one({"id": ticket_id}, {"_id": 0})


# ---------- Lagarto Amarelo · assistente de IA da ARDN (Gemini) ----------
ARDN_SYSTEM_PROMPT = (
    "És o Lagarto Amarelo, o assistente oficial de IA da ARDN (Associação Recreativa e Desportiva de "
    "Nespereira, NIF 503018112). Falas sempre em português de Portugal, de forma curta, simpática e "
    "rigorosa. "
    "Responde EXCLUSIVAMENTE a questões sobre a ARDN: estatutos e órgãos sociais, quotas, bar, "
    "vendas/POS, app do sócio, pontos, rodadas mistas, presenças na sede, parceiros locais, "
    "merchandising e histórico do clube. "
    "Se a pergunta for sobre qualquer outro tema (notícias, política, saúde, programação, outros "
    "clubes, etc.), recusa educadamente dizendo que apenas respondes sobre a ARDN. "
    "Nunca inventes factos, valores, nomes ou datas: se não tiveres a informação, diz que não a tens "
    "e sugere confirmar com a direção da ARDN. "
    "Contexto do clube: as quotas são mensais; o sócio com quotas em dia (🟢) ou por regularizar (🟡) "
    "acumula pontos, o sócio em dívida (🔴) não pontua; 5 pontos valem 1 €; um pedido de pagamento de "
    "quotas feito na app fica pendente até a direção o confirmar; a Rodada Mista junta sócios na mesma "
    "mesa e cada sócio só pode ter uma rodada mista aberta; as presenças na sede dão pontos por streak. "
    "Adesão de novos sócios (fluxo de aprovação): quem quer ser sócio preenche o formulário público de "
    "adesão em /aderir (na app e no ecrã inicial, sem login), com nome, data de nascimento, morada, "
    "telemóvel, e-mail, nº de sócio padrinho (facultativo) e aceitação do regulamento interno. O pedido "
    "fica sempre PENDENTE e não cria sócio nesse momento. A direção (admin, tesoureiro ou presidente) "
    "aprova ou rejeita em Clientes → Adesão de sócios (/aderir?filter=pending) ou no painel de pedidos "
    "(/pedidos); cada nova adesão conta na pill teal «N adesões» do cabeçalho do painel. Só com a "
    "aprovação é atribuído o nº de sócio (sequencial, o maior existente + 1) e o PIN automático (nº de "
    "sócio com zeros à esquerda até 5 dígitos), e a pessoa passa a poder entrar no portal do sócio. Se a "
    "adesão indicar um sócio padrinho válido, o padrinho recebe 1 ponto quando o pedido é aprovado. "
    "Menores de 16 anos ficam registados como menor/tutelado na ficha. Um pedido rejeitado não cria "
    "sócio, não dá pontos e não atribui PIN; o candidato deve falar com a direção para saber o motivo. "
    "O Sócio Honorário 👔 paga uma quota anual acordada (mínimo 20 €), paga menos por consumo e é "
    "convidado automático para os eventos. A adesão não se faz por telefone nem por mensagem: só pelo "
    "formulário ou presencialmente na sede. "
    "Historial e palmarés: tens acesso ao arquivo oficial da ARDN — identidade e estatutos, património, "
    "cronologia, plantéis por época (1996/97 a 2023/24), resultados oficiais da Associação de Futebol da "
    "Guarda, palmarés, tradições e documentos/fontes. O contexto do arquivo é injetado abaixo em cada "
    "pergunta: usa-o para responder sobre a história, as datas, os plantéis e o palmarés, citando a época "
    "ou o ano quando existir. O arquivo completo está em «Arquivo do clube» no painel do staff e no "
    "portal do sócio em modo consulta; se um dado não estiver no arquivo, diz que não o tens e sugere "
    "confirmar com a direção. "
    "Nunca dás conselhos médicos, jurídicos ou fiscais."
)

ASSISTANT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")


class AssistantChatIn(BaseModel):
    message: str
    history: Optional[List[dict]] = None


def _gemini_generate(api_key: str, model: str, contents: list, system_prompt: str = ARDN_SYSTEM_PROMPT) -> dict:
    import json as _json
    import urllib.request
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = _json.dumps({
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 800},
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return _json.loads(resp.read().decode("utf-8", "replace"))


async def _lagarto_archive_context() -> str:
    """Historial e palmarés do clube injetados no prompt do Lagarto Amarelo."""
    try:
        doc = await _club_archive_doc()
    except Exception as exc:  # nunca bloqueia a conversa por faltar o arquivo
        logger.warning("Lagarto Amarelo: arquivo do clube indisponível (%s)", exc)
        return ""
    lines = ["\n--- ARQUIVO OFICIAL DA ARDN ---"]
    history = str(doc.get("history") or "").strip()
    if history:
        lines.append("HISTÓRIA DO CLUBE:\n" + history[:4000])
    legacy = doc.get("legacy") or {}
    timeline = [t for t in (legacy.get("timeline") or []) if isinstance(t, dict)]
    if timeline:
        lines.append("CRONOLOGIA:")
        lines += [f"- {t.get('date') or '—'}: {t.get('event') or '—'}" for t in timeline[:15]]
    squads = [s for s in (legacy.get("squads") or []) if isinstance(s, dict)]
    seasons = [str(s.get("season") or "").strip() for s in squads if s.get("season")]
    if seasons:
        lines.append("PLANTÉIS E ÉPOCAS NO ARQUIVO: " + ", ".join(seasons[:40]))
    palmares = [p for p in (doc.get("palmares") or []) if isinstance(p, dict)]
    if palmares:
        lines.append("PALMARÉS:")
        lines += [
            f"- {p.get('season') or '—'} · {p.get('competition') or '—'} · {p.get('result') or '—'}"
            for p in palmares[:40]
        ]
    documents = [d for d in (doc.get("documents") or []) if isinstance(d, dict)]
    if documents:
        lines.append("DOCUMENTOS DO ARQUIVO:")
        lines += [
            f"- {d.get('title') or '—'}" + (f" ({d.get('year')})" if d.get("year") else "")
            for d in documents[:20]
        ]
    lines.append(
        "No painel, o arquivo completo (cronologia, plantéis por época, resultados oficiais da AF Guarda "
        "e tradições) está em «Arquivo do clube»; no portal do sócio há o mesmo arquivo em modo consulta."
    )
    return "\n".join(lines)


async def _lagarto_answer(message: str, history: Optional[List[dict]]) -> str:
    """Pergunta à IA com o prompt restritivo da ARDN injetado."""
    msg = (message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Escreve a tua pergunta")
    if len(msg) > 1500:
        raise HTTPException(status_code=400, detail="Pergunta demasiado longa (máximo 1500 caracteres)")
    api_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="O Lagarto Amarelo ainda não está configurado (falta a chave da IA). "
                   "Pede à direção para a ativar.",
        )
    contents = []
    for turn in (history or [])[-10:]:
        text = str((turn or {}).get("content") or "").strip()
        if not text:
            continue
        contents.append({
            "role": "model" if (turn or {}).get("role") in ("assistant", "model") else "user",
            "parts": [{"text": text[:2000]}],
        })
    contents.append({"role": "user", "parts": [{"text": msg}]})
    system_prompt = ARDN_SYSTEM_PROMPT + await _lagarto_archive_context()
    try:
        data = await asyncio.to_thread(_gemini_generate, api_key, ASSISTANT_MODEL, contents, system_prompt)
    except Exception as exc:
        logger.warning("Lagarto Amarelo (Gemini) falhou: %s", exc)
        raise HTTPException(status_code=502, detail="O Lagarto Amarelo não conseguiu responder agora. Tenta novamente.")
    parts = (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts")) or []
    reply = "".join(p.get("text", "") for p in parts).strip()
    if not reply:
        raise HTTPException(status_code=502, detail="O Lagarto Amarelo não deu resposta. Tenta reformular a pergunta.")
    return reply


@api_router.post("/socio/ai-assistant")
async def socio_ai_assistant(body: AssistantChatIn, socio: dict = Depends(get_current_socio)):
    reply = await _lagarto_answer(body.message, body.history)
    await _audit("ai_assistant_socio", f"socio:{socio.get('member_number') or socio['id']}",
                 entity="client", entity_id=socio["id"],
                 summary=f"Lagarto Amarelo · pergunta de {socio.get('name')} · «{body.message.strip()[:90]}»")
    return {"status": "success", "response": reply}


@api_router.post("/ai-assistant")
async def staff_ai_assistant(body: AssistantChatIn, user: dict = Depends(get_current_user)):
    reply = await _lagarto_answer(body.message, body.history)
    await _audit("ai_assistant_staff", user["email"], entity="user", entity_id=user.get("id"),
                 summary=f"Lagarto Amarelo · pergunta de {user.get('name') or user['email']} · «{body.message.strip()[:90]}»")
    return {"status": "success", "response": reply}


# ---------- ARDN · Historial, Palmarés e Arquivo Documental ----------
from club_archive_history import CLUB_LEGACY, CLUB_HISTORY_TEXT, CLUB_PALMARES, CLUB_SOURCES

CLUB_ARCHIVE_DEFAULT = {
    "history": (
        "A Associação Recreativa e Desportiva de Nespereira (ARDN), NIF 503018112, é o clube da "
        "freguesia de Nespereira: desporto, convívio e uma sede aberta a todas as gerações.\n\n"
        "Este arquivo reúne a memória do clube — a história, o palmarés das equipas e os documentos "
        "que contam o percurso da associação. É mantido pela direção e pode ser consultado pelos "
        "sócios e pelo staff."
    ),
    "palmares": [],
    "documents": [],
    "updated_at": None,
    "updated_by": None,
}


async def _club_archive_doc() -> dict:
    doc = await db.club_archive.find_one({"_id": "ardn"})
    if not doc:
        return {**CLUB_ARCHIVE_DEFAULT, "legacy": CLUB_LEGACY}
    doc.pop("_id", None)
    return {**CLUB_ARCHIVE_DEFAULT, **doc, "legacy": CLUB_LEGACY}


async def _seed_club_archive_history():
    """Semeia (uma vez) o arquivo oficial: história, palmarés e fontes documentais."""
    doc = (await db.club_archive.find_one({"_id": "ardn"})) or {}
    sets = {}
    if not (doc.get("history") or "").strip() or doc.get("history") == CLUB_ARCHIVE_DEFAULT["history"]:
        sets["history"] = CLUB_HISTORY_TEXT
    if not doc.get("palmares"):
        sets["palmares"] = [{**row, "id": str(uuid.uuid4())} for row in CLUB_PALMARES]
    if not doc.get("documents"):
        sets["documents"] = [{**row, "id": str(uuid.uuid4())} for row in CLUB_SOURCES]
    if not sets:
        return
    sets["updated_at"] = datetime.now(timezone.utc).isoformat()
    sets["updated_by"] = "arquivo oficial da ARDN"
    await db.club_archive.update_one({"_id": "ardn"}, {"$set": sets}, upsert=True)
    logging.getLogger(__name__).info("Arquivo do clube semeado com o historial oficial")


class ClubArchiveIn(BaseModel):
    history: Optional[str] = None
    palmares: Optional[List[dict]] = None
    documents: Optional[List[dict]] = None


def _archive_rows(rows: Optional[List[dict]], fields: List[str]) -> list:
    out = []
    for row in rows or []:
        row = row if isinstance(row, dict) else {}
        item = {f: (str(row.get(f) or "").strip()[:400] or None) for f in fields}
        if not item.get(fields[0]):
            continue
        item["id"] = str(row.get("id") or uuid.uuid4())
        out.append(item)
    return out


@api_router.get("/club-archive")
async def get_club_archive(user: dict = Depends(get_current_user)):
    return await _club_archive_doc()


@api_router.get("/socio/club-archive")
async def get_socio_club_archive(socio: dict = Depends(get_current_socio)):
    return await _club_archive_doc()


@api_router.put("/club-archive")
async def save_club_archive(body: ClubArchiveIn,
                            user: dict = Depends(require_role("admin", "presidente", "tesoureiro"))):
    """A direção mantém o historial, o palmarés e o arquivo documental."""
    doc = {
        "history": (body.history if body.history is not None else (await _club_archive_doc())["history"]),
        "palmares": _archive_rows(body.palmares, ["season", "competition", "result"]),
        "documents": _archive_rows(body.documents, ["title", "year", "url", "note"]),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": user["email"],
    }
    await db.club_archive.find_one_and_replace({"_id": "ardn"}, {"_id": "ardn", **doc}, upsert=True)
    await _audit("club_archive_update", user["email"], entity="club_archive", entity_id="ardn",
                 summary=f"Arquivo do clube atualizado · {len(doc['palmares'])} entradas de palmarés · "
                         f"{len(doc['documents'])} documentos")
    return {**doc, "legacy": CLUB_LEGACY}


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

