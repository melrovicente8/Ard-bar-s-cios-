"""Iteration 2: roles/permissions, member points, notify endpoints."""
import os
import uuid
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

CREDS = {
    "admin": ("admin@ard.pt", "admin123"),
    "tesoureiro": ("tesoureiro@ard.pt", "tesoureiro123"),
    "func1": ("func1@ard.pt", "func123"),
    "func2": ("func2@ard.pt", "func123"),
    "func3": ("func3@ard.pt", "func123"),
}


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    assert "access_token" in s.cookies
    return s, r.json()


@pytest.fixture(scope="module")
def admin():
    s, u = _login(*CREDS["admin"])
    return s


@pytest.fixture(scope="module")
def tesoureiro():
    s, u = _login(*CREDS["tesoureiro"])
    return s


@pytest.fixture(scope="module")
def func():
    s, u = _login(*CREDS["func1"])
    return s


# ---------- AUTH / ROLES ----------
@pytest.mark.parametrize("key,expected_role", [
    ("admin", "admin"),
    ("tesoureiro", "tesoureiro"),
    ("func1", "funcionario"),
    ("func2", "funcionario"),
    ("func3", "funcionario"),
])
def test_seeded_user_login_and_role(key, expected_role):
    s, body = _login(*CREDS[key])
    assert body["role"] == expected_role
    me = s.get(f"{BASE}/api/auth/me").json()
    assert me["role"] == expected_role


# ---------- ADMIN permissions ----------
def test_admin_can_crud_products_and_clients(admin):
    p = admin.post(f"{BASE}/api/products", json={"name": f"TEST_A_{uuid.uuid4().hex[:6]}", "price": 1.5, "quantity": 5}).json()
    pid = p["id"]
    d = admin.delete(f"{BASE}/api/products/{pid}")
    assert d.status_code == 200

    c = admin.post(f"{BASE}/api/clients", json={"name": f"TEST_AC_{uuid.uuid4().hex[:6]}"}).json()
    dc = admin.delete(f"{BASE}/api/clients/{c['id']}")
    assert dc.status_code == 200


def test_admin_can_access_admin_clients(admin):
    r = admin.get(f"{BASE}/api/admin/clients")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- TESOUREIRO permissions ----------
def test_tesoureiro_can_create_update_replenish_but_not_delete(tesoureiro, admin):
    name = f"TEST_T_{uuid.uuid4().hex[:6]}"
    p = tesoureiro.post(f"{BASE}/api/products", json={"name": name, "price": 2.0, "quantity": 4})
    assert p.status_code == 200, p.text
    pid = p.json()["id"]

    u = tesoureiro.put(f"{BASE}/api/products/{pid}", json={"price": 2.5})
    assert u.status_code == 200

    rep = tesoureiro.post(f"{BASE}/api/products/replenish", json={"product_id": pid, "quantity": 3})
    assert rep.status_code == 200

    d = tesoureiro.delete(f"{BASE}/api/products/{pid}")
    assert d.status_code == 403

    # cleanup as admin
    admin.delete(f"{BASE}/api/products/{pid}")


def test_tesoureiro_cannot_delete_client_or_access_admin(tesoureiro, admin):
    c = admin.post(f"{BASE}/api/clients", json={"name": f"TEST_TC_{uuid.uuid4().hex[:6]}"}).json()
    d = tesoureiro.delete(f"{BASE}/api/clients/{c['id']}")
    assert d.status_code == 403
    ac = tesoureiro.get(f"{BASE}/api/admin/clients")
    assert ac.status_code == 403
    admin.delete(f"{BASE}/api/clients/{c['id']}")


# ---------- FUNCIONARIO permissions ----------
def test_funcionario_blocked_from_product_mutations_and_admin(func, admin):
    # cannot create
    r = func.post(f"{BASE}/api/products", json={"name": "X", "price": 1, "quantity": 1})
    assert r.status_code == 403
    # need an existing product to attempt put/replenish/delete
    p = admin.post(f"{BASE}/api/products", json={"name": f"TEST_F_{uuid.uuid4().hex[:6]}", "price": 1, "quantity": 5}).json()
    pid = p["id"]
    assert func.put(f"{BASE}/api/products/{pid}", json={"price": 2}).status_code == 403
    assert func.post(f"{BASE}/api/products/replenish", json={"product_id": pid, "quantity": 1}).status_code == 403
    assert func.delete(f"{BASE}/api/products/{pid}").status_code == 403
    assert func.get(f"{BASE}/api/admin/clients").status_code == 403
    admin.delete(f"{BASE}/api/products/{pid}")


def test_funcionario_can_create_client_sale_payment_and_limited_edit(func, admin):
    # create client (funcionario allowed)
    c = func.post(f"{BASE}/api/clients", json={"name": f"TEST_FC_{uuid.uuid4().hex[:6]}", "contact": "910000000"})
    assert c.status_code == 200
    cid = c.json()["id"]

    # cannot delete client
    assert func.delete(f"{BASE}/api/clients/{cid}").status_code == 403

    # admin creates product for sale
    p = admin.post(f"{BASE}/api/products", json={"name": f"TEST_FP_{uuid.uuid4().hex[:6]}", "price": 4.0, "quantity": 5}).json()
    pid = p["id"]
    sale = func.post(f"{BASE}/api/sales", json={"client_id": cid, "items": [{"product_id": pid, "quantity": 1}]})
    assert sale.status_code == 200

    pay = func.post(f"{BASE}/api/payments", json={"client_id": cid, "amount": 2.0})
    assert pay.status_code == 200

    # PUT with contact+email succeeds
    upd = func.put(f"{BASE}/api/clients/{cid}", json={"contact": "911111111", "email": "x@y.pt"})
    assert upd.status_code == 200
    assert upd.json()["contact"] == "911111111"
    assert upd.json()["email"] == "x@y.pt"

    # PUT with extras: contact stays applied, other fields silently dropped (server still 200 if any allowed field present)
    upd2 = func.put(f"{BASE}/api/clients/{cid}", json={"name": "HACK", "contact": "912222222"})
    assert upd2.status_code == 200
    assert upd2.json()["contact"] == "912222222"
    assert upd2.json()["name"] != "HACK"

    # PUT with only name -> 403 per spec
    bad = func.put(f"{BASE}/api/clients/{cid}", json={"name": "Nope"})
    assert bad.status_code == 403, bad.text

    # cleanup
    admin.delete(f"{BASE}/api/products/{pid}")
    admin.delete(f"{BASE}/api/clients/{cid}")


# ---------- CLIENT MEMBER FIELDS ----------
def test_client_member_fields_and_listing(admin):
    body = {"name": f"TEST_MEM_{uuid.uuid4().hex[:6]}", "member_number": "777", "is_member": True}
    r = admin.post(f"{BASE}/api/clients", json=body)
    assert r.status_code == 200
    d = r.json()
    assert d["is_member"] is True
    assert d["member_number"] == "777"
    assert d["points"] == 0
    # listing has the fields
    lst = admin.get(f"{BASE}/api/clients").json()
    me = [x for x in lst if x["id"] == d["id"]][0]
    for k in ("is_member", "member_number", "points"):
        assert k in me
    admin.delete(f"{BASE}/api/clients/{d['id']}")


# ---------- POINTS RULES ----------
def test_points_member_rule_5eur(admin):
    c = admin.post(f"{BASE}/api/clients", json={"name": f"TEST_PM_{uuid.uuid4().hex[:6]}", "is_member": True, "member_number": "1"}).json()
    p = admin.post(f"{BASE}/api/products", json={"name": f"TEST_PP_{uuid.uuid4().hex[:6]}", "price": 5.0, "quantity": 10}).json()
    sale = admin.post(f"{BASE}/api/sales", json={"client_id": c["id"], "items": [{"product_id": p["id"], "quantity": 2}]}).json()
    assert sale["total"] == 10.0
    assert sale["points_earned"] == 2
    assert sale["is_member_at_sale"] is True
    after = admin.get(f"{BASE}/api/clients/{c['id']}").json()["client"]
    assert after["points"] == 2
    admin.delete(f"{BASE}/api/products/{p['id']}")
    admin.delete(f"{BASE}/api/clients/{c['id']}")


def test_points_nonmember_rule_10eur(admin):
    c = admin.post(f"{BASE}/api/clients", json={"name": f"TEST_PN_{uuid.uuid4().hex[:6]}", "is_member": False}).json()
    p = admin.post(f"{BASE}/api/products", json={"name": f"TEST_PP2_{uuid.uuid4().hex[:6]}", "price": 5.0, "quantity": 10}).json()
    sale = admin.post(f"{BASE}/api/sales", json={"client_id": c["id"], "items": [{"product_id": p["id"], "quantity": 5}]}).json()
    assert sale["total"] == 25.0
    assert sale["points_earned"] == 2
    assert sale["is_member_at_sale"] is False
    after = admin.get(f"{BASE}/api/clients/{c['id']}").json()["client"]
    assert after["points"] == 2
    admin.delete(f"{BASE}/api/products/{p['id']}")
    admin.delete(f"{BASE}/api/clients/{c['id']}")


# ---------- NOTIFY ----------
@pytest.fixture(scope="module")
def notify_ctx(admin):
    c = admin.post(f"{BASE}/api/clients", json={
        "name": f"TEST_NT_{uuid.uuid4().hex[:6]}",
        "contact": "912 345 678",
        "email": "test@example.pt",
        "is_member": True,
        "member_number": "42",
    }).json()
    pay = admin.post(f"{BASE}/api/payments", json={"client_id": c["id"], "amount": 5.0}).json()
    yield {"client": c, "payment": pay}
    admin.delete(f"{BASE}/api/clients/{c['id']}")


def test_notify_email_no_resend(admin, notify_ctx):
    r = admin.post(f"{BASE}/api/notify/payment", json={"payment_id": notify_ctx["payment"]["id"], "channel": "email"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["channel"] == "email"
    assert d["sent"] is False
    assert "Resend" in d["note"]


def test_notify_whatsapp(admin, notify_ctx):
    r = admin.post(f"{BASE}/api/notify/payment", json={"payment_id": notify_ctx["payment"]["id"], "channel": "whatsapp"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["url"].startswith("https://wa.me/")
    assert d["phone"] == "912345678"


def test_notify_sms(admin, notify_ctx):
    r = admin.post(f"{BASE}/api/notify/payment", json={"payment_id": notify_ctx["payment"]["id"], "channel": "sms"})
    assert r.status_code == 200
    assert r.json()["url"].startswith("sms:")


def test_notify_validation_missing_fields(admin):
    c = admin.post(f"{BASE}/api/clients", json={"name": f"TEST_NV_{uuid.uuid4().hex[:6]}"}).json()
    pay = admin.post(f"{BASE}/api/payments", json={"client_id": c["id"], "amount": 1.0}).json()
    for ch in ("email", "whatsapp", "sms"):
        r = admin.post(f"{BASE}/api/notify/payment", json={"payment_id": pay["id"], "channel": ch})
        assert r.status_code == 400, f"{ch}: {r.status_code} {r.text}"
    admin.delete(f"{BASE}/api/clients/{c['id']}")
