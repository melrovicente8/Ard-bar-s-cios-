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
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()

if resend and RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

ROLES = {"admin", "tesoureiro", "funcionario"}

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

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    quantity: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    category: Optional[str] = None
    image_url: Optional[str] = None

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

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    member_number: Optional[str] = None
    is_member: Optional[bool] = None

class SaleItemIn(BaseModel):
    product_id: str
    quantity: int

class SaleIn(BaseModel):
    client_id: str
    items: List[SaleItemIn]

class PaymentIn(BaseModel):
    client_id: str
    amount: float
    note: Optional[str] = None

class NotifyPaymentIn(BaseModel):
    payment_id: str
    channel: str  # "email" | "whatsapp" | "sms"

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
    items = await db.clients.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    return items

@api_router.post("/clients")
async def create_client(body: ClientIn, user: dict = Depends(get_current_user)):
    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "name": body.name,
        "contact": body.contact,
        "email": body.email,
        "note": body.note,
        "member_number": body.member_number,
        "is_member": bool(body.is_member),
        "points": 0,
        "balance": 0.0,
        "total_spent": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, body: ClientUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    # Funcionários só podem editar contacto e email; admin/tesoureiro tudo.
    if user.get("role") == "funcionario":
        allowed = {"contact", "email"}
        update = {k: v for k, v in update.items() if k in allowed}
        if not update:
            raise HTTPException(status_code=403, detail="Funcionários só podem editar contacto e email")
    res = await db.clients.update_one({"id": client_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return doc

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.clients.delete_one({"id": client_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return {"ok": True}

@api_router.get("/clients/{client_id}")
async def client_detail(client_id: str, user: dict = Depends(get_current_user)):
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    sales = await db.sales.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    payments = await db.payments.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"client": c, "sales": sales, "payments": payments}

# ---------- Sales ----------
@api_router.post("/sales")
async def create_sale(body: SaleIn, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="Sem itens")
    client_doc = await db.clients.find_one({"id": body.client_id})
    if not client_doc:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    # validate stock and build line items
    line_items = []
    total = 0.0
    for it in body.items:
        prod = await db.products.find_one({"id": it.product_id})
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
    # Points: 1 ponto por cada 5€ se sócio com cotas pagas, senão por cada 10€
    points_step = 5.0 if client_doc.get("is_member") else 10.0
    points_earned = int(total // points_step)
    sale_doc = {
        "id": sale_id,
        "client_id": body.client_id,
        "client_name": client_doc["name"],
        "items": line_items,
        "total": total,
        "points_earned": points_earned,
        "is_member_at_sale": bool(client_doc.get("is_member", False)),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    await db.sales.insert_one(sale_doc)

    # update client balance, total spent, and points
    await db.clients.update_one(
        {"id": body.client_id},
        {"$inc": {"balance": total, "total_spent": total, "points": points_earned}},
    )
    sale_doc.pop("_id", None)
    return sale_doc

@api_router.get("/sales")
async def list_sales(user: dict = Depends(get_current_user)):
    items = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

# ---------- Payments ----------
@api_router.post("/payments")
async def create_payment(body: PaymentIn, user: dict = Depends(get_current_user)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    c = await db.clients.find_one({"id": body.client_id})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    pid = str(uuid.uuid4())
    pay = {
        "id": pid,
        "client_id": body.client_id,
        "client_name": c["name"],
        "amount": float(body.amount),
        "note": body.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    await db.payments.insert_one(pay)
    await db.clients.update_one({"id": body.client_id}, {"$inc": {"balance": -float(body.amount)}})
    pay.pop("_id", None)
    return pay

# ---------- Dashboard ----------
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    clients_total = await db.clients.count_documents({})
    total_stock_value = sum(p.get("price", 0) * p.get("quantity", 0) for p in products)
    low_stock = [p for p in products if p.get("quantity", 0) <= p.get("low_stock_threshold", 0)]

    # today sales
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today_start.isoformat()
    today_sales_cur = db.sales.find({"created_at": {"$gte": today_iso}}, {"_id": 0})
    today_sales = await today_sales_cur.to_list(2000)
    today_total = sum(s.get("total", 0) for s in today_sales)

    # outstanding debts
    clients = await db.clients.find({}, {"_id": 0}).to_list(2000)
    outstanding = sum(max(c.get("balance", 0), 0) for c in clients)

    # last 7 days sales by day
    last_7 = []
    for i in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = day + timedelta(days=1)
        cur = db.sales.find({"created_at": {"$gte": day.isoformat(), "$lt": next_day.isoformat()}}, {"_id": 0})
        sales_day = await cur.to_list(2000)
        last_7.append({
            "day": day.strftime("%a"),
            "date": day.strftime("%Y-%m-%d"),
            "total": sum(s.get("total", 0) for s in sales_day),
        })

    recent_sales = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(8)

    return {
        "products_count": len(products),
        "clients_count": clients_total,
        "total_stock_value": total_stock_value,
        "today_sales_total": today_total,
        "today_sales_count": len(today_sales),
        "outstanding_debt": outstanding,
        "low_stock": low_stock,
        "sales_last_7_days": last_7,
        "recent_sales": recent_sales,
    }

# ---------- Admin Directory ----------
@api_router.get("/admin/clients")
async def admin_clients_directory(user: dict = Depends(require_role("admin"))):
    clients = await db.clients.find({}, {"_id": 0}).sort("name", 1).to_list(5000)
    # enrich with stats already on the doc (balance, total_spent, points)
    return clients

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
