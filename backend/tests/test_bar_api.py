import os, requests, pytest, uuid

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://inventory-bar-app.preview.emergentagent.com"
ADMIN = {"email": "admin@bar.pt", "password": "admin123"}

@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, r.text
    assert "access_token" in sess.cookies
    return sess

# Auth
def test_login_and_me(s):
    me = s.get(f"{BASE}/api/auth/me", timeout=20)
    assert me.status_code == 200
    assert me.json()["email"] == "admin@bar.pt"

def test_unauthorized():
    r = requests.get(f"{BASE}/api/auth/me", timeout=20)
    assert r.status_code == 401

def test_bad_login():
    r = requests.post(f"{BASE}/api/auth/login", json={"email":"admin@bar.pt","password":"wrong"}, timeout=20)
    assert r.status_code == 401

# Products CRUD + replenish
def test_products_crud_and_replenish(s):
    r = s.get(f"{BASE}/api/products"); assert r.status_code == 200
    pname = f"TEST_Prod_{uuid.uuid4().hex[:6]}"
    c = s.post(f"{BASE}/api/products", json={"name": pname, "price": 2.5, "quantity": 10, "low_stock_threshold": 3})
    assert c.status_code == 200, c.text
    pid = c.json()["id"]
    assert c.json()["name"] == pname
    u = s.put(f"{BASE}/api/products/{pid}", json={"price": 3.0})
    assert u.status_code == 200 and u.json()["price"] == 3.0
    rep = s.post(f"{BASE}/api/products/replenish", json={"product_id": pid, "quantity": 5, "cost_price": 1.0})
    assert rep.status_code == 200
    assert rep.json()["product"]["quantity"] == 15
    # delete
    d = s.delete(f"{BASE}/api/products/{pid}"); assert d.status_code == 200
    g = s.get(f"{BASE}/api/products")
    assert pid not in [p["id"] for p in g.json()]

# Clients CRUD + detail
@pytest.fixture(scope="module")
def client_id(s):
    r = s.post(f"{BASE}/api/clients", json={"name": f"TEST_C_{uuid.uuid4().hex[:6]}", "contact": "999"})
    assert r.status_code == 200
    cid = r.json()["id"]
    yield cid
    s.delete(f"{BASE}/api/clients/{cid}")

def test_clients_crud(s, client_id):
    g = s.get(f"{BASE}/api/clients/{client_id}")
    assert g.status_code == 200
    body = g.json()
    assert "client" in body and "sales" in body and "payments" in body
    u = s.put(f"{BASE}/api/clients/{client_id}", json={"contact": "111"})
    assert u.status_code == 200 and u.json()["contact"] == "111"

# Sales: creates sale, decrements stock, increments balance
def test_sale_flow_and_payment(s, client_id):
    # create test product with stock 5
    p = s.post(f"{BASE}/api/products", json={"name": f"TEST_S_{uuid.uuid4().hex[:6]}", "price": 4.0, "quantity": 5}).json()
    pid = p["id"]
    # successful sale qty=2 -> total 8.0
    sale = s.post(f"{BASE}/api/sales", json={"client_id": client_id, "items":[{"product_id": pid, "quantity": 2}]})
    assert sale.status_code == 200, sale.text
    assert sale.json()["total"] == 8.0
    # stock decremented
    prod = [x for x in s.get(f"{BASE}/api/products").json() if x["id"] == pid][0]
    assert prod["quantity"] == 3
    # client balance increased
    c = s.get(f"{BASE}/api/clients/{client_id}").json()["client"]
    assert c["balance"] >= 8.0
    assert c["total_spent"] >= 8.0
    # insufficient stock
    bad = s.post(f"{BASE}/api/sales", json={"client_id": client_id, "items":[{"product_id": pid, "quantity": 999}]})
    assert bad.status_code == 400
    # payment decrements balance
    bal_before = c["balance"]
    pay = s.post(f"{BASE}/api/payments", json={"client_id": client_id, "amount": 5.0})
    assert pay.status_code == 200
    c2 = s.get(f"{BASE}/api/clients/{client_id}").json()["client"]
    assert abs(c2["balance"] - (bal_before - 5.0)) < 0.001
    # cleanup
    s.delete(f"{BASE}/api/products/{pid}")

# Dashboard
def test_dashboard(s):
    r = s.get(f"{BASE}/api/dashboard")
    assert r.status_code == 200
    d = r.json()
    for k in ["products_count","clients_count","total_stock_value","today_sales_total","outstanding_debt","low_stock","sales_last_7_days","recent_sales"]:
        assert k in d, f"missing {k}"
    assert len(d["sales_last_7_days"]) == 7

# Logout
def test_logout():
    sess = requests.Session()
    sess.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=20)
    r = sess.post(f"{BASE}/api/auth/logout")
    assert r.status_code == 200
    # cookie should be deleted; calling /me without cookie -> 401
    sess.cookies.clear()
    me = sess.get(f"{BASE}/api/auth/me")
    assert me.status_code == 401
