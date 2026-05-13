"""Tests for Fase A (iter 8) — sale edit/delete, user rename, auto-PIN."""
import os
import time
import uuid
import requests
import pytest
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inventory-bar-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "bar_stock_db")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin@ard.pt", "admin123")


@pytest.fixture(scope="module")
def tesoureiro():
    return _login("tesoureiro@ard.pt", "tesoureiro123")


@pytest.fixture(scope="module")
def funcionario():
    return _login("func1@ard.pt", "func123")


@pytest.fixture(scope="module")
def db_handle():
    cli = MongoClient(MONGO_URL)
    return cli[DB_NAME]


def _mk_product(admin):
    pid_name = f"TEST_iter8_prod_{uuid.uuid4().hex[:6]}"
    r = admin.post(f"{API}/products", json={"name": pid_name, "price": 1.0, "quantity": 200, "category": "Bebida"})
    assert r.status_code == 200, r.text
    return r.json()


def _mk_client(admin, member_number=None):
    body = {"name": f"TEST_iter8_cli_{uuid.uuid4().hex[:6]}"}
    if member_number:
        body["member_number"] = member_number
    r = admin.post(f"{API}/clients", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _mk_sale(session, client_id, product_id, qty=2):
    r = session.post(f"{API}/sales", json={"client_id": client_id, "items": [{"product_id": product_id, "quantity": qty}]})
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Sale edit/transfer/delete ----------------

class TestSaleEdit:
    def test_admin_can_edit_items_and_total_updates(self, admin):
        p = _mk_product(admin)
        c = _mk_client(admin)
        sale = _mk_sale(admin, c["id"], p["id"], qty=2)
        # change qty 2 → 5
        r = admin.put(f"{API}/sales/{sale['id']}", json={"items": [{"product_id": p["id"], "quantity": 5}]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 5.0
        # verify client balance updated (was 2, now 5)
        r2 = admin.get(f"{API}/clients/{c['id']}")
        assert r2.status_code == 200
        assert abs(r2.json()["client"]["balance"] - 5.0) < 1e-6

    def test_admin_transfer_sale_to_another_client(self, admin):
        p = _mk_product(admin)
        c1 = _mk_client(admin)
        c2 = _mk_client(admin)
        sale = _mk_sale(admin, c1["id"], p["id"], qty=3)  # 3€ to c1
        r = admin.put(f"{API}/sales/{sale['id']}", json={"client_id": c2["id"]})
        assert r.status_code == 200, r.text
        b1 = admin.get(f"{API}/clients/{c1['id']}").json()["client"]["balance"]
        b2 = admin.get(f"{API}/clients/{c2['id']}").json()["client"]["balance"]
        assert abs(b1) < 1e-6
        assert abs(b2 - 3.0) < 1e-6

    def test_funcionario_can_edit_fresh_sale(self, admin, funcionario):
        p = _mk_product(admin)
        c = _mk_client(admin)
        sale = _mk_sale(funcionario, c["id"], p["id"], qty=1)
        r = funcionario.put(f"{API}/sales/{sale['id']}", json={"items": [{"product_id": p["id"], "quantity": 2}]})
        assert r.status_code == 200, r.text

    def test_funcionario_403_on_old_sale(self, admin, funcionario, db_handle):
        p = _mk_product(admin)
        c = _mk_client(admin)
        sale = _mk_sale(funcionario, c["id"], p["id"], qty=1)
        # backdate created_at by 25h
        old = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        db_handle.sales.update_one({"id": sale["id"]}, {"$set": {"created_at": old}})
        r = funcionario.put(f"{API}/sales/{sale['id']}", json={"items": [{"product_id": p["id"], "quantity": 5}]})
        assert r.status_code == 403, r.text
        r2 = funcionario.delete(f"{API}/sales/{sale['id']}")
        assert r2.status_code == 403

    def test_admin_can_delete_old_sale_and_audit_log_written(self, admin, db_handle):
        p = _mk_product(admin)
        c = _mk_client(admin)
        sale = _mk_sale(admin, c["id"], p["id"], qty=2)
        before_count = db_handle.audit_log.count_documents({"type": "sale_cancel"})
        r = admin.delete(f"{API}/sales/{sale['id']}")
        assert r.status_code == 200, r.text
        after_count = db_handle.audit_log.count_documents({"type": "sale_cancel"})
        assert after_count == before_count + 1


# ---------------- Users (admin only) ----------------

class TestUsers:
    def test_list_users_admin_only(self, admin, funcionario):
        r = admin.get(f"{API}/users")
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert "admin@ard.pt" in emails
        r2 = funcionario.get(f"{API}/users")
        assert r2.status_code == 403

    def test_rename_funcionario(self, admin):
        users = admin.get(f"{API}/users").json()
        f1 = next(u for u in users if u["email"] == "func1@ard.pt")
        new_name = f"TEST_Func_{uuid.uuid4().hex[:4]}"
        r = admin.put(f"{API}/users/{f1['id']}", json={"name": new_name})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == new_name
        # restore
        admin.put(f"{API}/users/{f1['id']}", json={"name": "Funcionário 1"})

    def test_rename_admin_forbidden(self, admin):
        users = admin.get(f"{API}/users").json()
        adm = next(u for u in users if u["role"] == "admin")
        r = admin.put(f"{API}/users/{adm['id']}", json={"name": "Hacked"})
        assert r.status_code == 403

    def test_rename_requires_admin(self, funcionario, admin):
        users = admin.get(f"{API}/users").json()
        f1 = next(u for u in users if u["email"] == "func2@ard.pt")
        r = funcionario.put(f"{API}/users/{f1['id']}", json={"name": "x"})
        assert r.status_code == 403

    def test_empty_name_400(self, admin):
        users = admin.get(f"{API}/users").json()
        f1 = next(u for u in users if u["email"] == "func1@ard.pt")
        r = admin.put(f"{API}/users/{f1['id']}", json={"name": "   "})
        assert r.status_code == 400


# ---------------- Auto-PIN from member_number ----------------

class TestAutoPin:
    def test_create_client_with_member_number_generates_pin(self, admin):
        mn = str(90000 + int(time.time()) % 9999)
        c = _mk_client(admin, member_number=mn)
        # try socio login with padded number as PIN
        expected_pin = mn.zfill(5)
        s = requests.Session()
        r = s.post(f"{API}/socio/login", json={"member_number": mn, "pin": expected_pin})
        assert r.status_code == 200, r.text
        assert r.json()["client"]["id"] == c["id"]

    def test_short_member_number_padded(self, admin):
        mn = f"9{int(time.time()) % 99}"  # ~3 digits
        c = _mk_client(admin, member_number=mn)
        expected_pin = mn.zfill(5)
        s = requests.Session()
        r = s.post(f"{API}/socio/login", json={"member_number": mn, "pin": expected_pin})
        assert r.status_code == 200

    def test_put_client_set_member_number_generates_pin(self, admin):
        # client without member_number/pin
        c = _mk_client(admin)
        mn = str(95000 + int(time.time()) % 999)
        r = admin.put(f"{API}/clients/{c['id']}", json={"member_number": mn})
        assert r.status_code == 200, r.text
        # login with auto PIN
        s = requests.Session()
        r2 = s.post(f"{API}/socio/login", json={"member_number": mn, "pin": mn.zfill(5)})
        assert r2.status_code == 200

    def test_explicit_pin_not_overwritten_by_auto(self, admin):
        # client with explicit pin first
        mn = str(96000 + int(time.time()) % 999)
        body = {"name": f"TEST_iter8_explicit_{uuid.uuid4().hex[:4]}", "member_number": mn, "pin": "55555"}
        r = admin.post(f"{API}/clients", json=body)
        assert r.status_code == 200
        s = requests.Session()
        r2 = s.post(f"{API}/socio/login", json={"member_number": mn, "pin": "55555"})
        assert r2.status_code == 200
        # and auto pin should NOT work
        r3 = s.post(f"{API}/socio/login", json={"member_number": mn, "pin": mn.zfill(5)})
        assert r3.status_code == 401
