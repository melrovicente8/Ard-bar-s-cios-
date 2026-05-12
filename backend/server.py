from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- App ----------
app = FastAPI(title="Bar Stock Manager")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

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

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None

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
async def create_product(body: ProductIn, user: dict = Depends(get_current_user)):
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
async def update_product(product_id: str, body: ProductUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = await db.products.update_one({"id": product_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    return doc

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(get_current_user)):
    res = await db.products.delete_one({"id": product_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return {"ok": True}

@api_router.post("/products/replenish")
async def replenish_stock(body: StockReplenishIn, user: dict = Depends(get_current_user)):
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
    res = await db.clients.update_one({"id": client_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return doc

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)):
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
    sale_doc = {
        "id": sale_id,
        "client_id": body.client_id,
        "client_name": client_doc["name"],
        "items": line_items,
        "total": total,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user["email"],
    }
    await db.sales.insert_one(sale_doc)

    # update client balance and total spent
    await db.clients.update_one(
        {"id": body.client_id},
        {"$inc": {"balance": total, "total_spent": total}},
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

# ---------- Bootstrap ----------
@app.on_event("startup")
async def on_startup():
    # indexes
    await db.users.create_index("email", unique=True)
    await db.products.create_index("id", unique=True)
    await db.clients.create_index("id", unique=True)
    await db.sales.create_index("created_at")

    # seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@bar.pt").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "password_hash": hash_password(admin_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )

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
