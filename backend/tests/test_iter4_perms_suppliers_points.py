"""Iteration 4 tests: funcionario perms strip, admin/clients filter, suppliers + supplier orders, pay-with-points."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inventory-bar-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


def _socio_login(member_number, pin):
    s = requests.Session()
    r = s.post(f"{API}/socio/login", json={"member_number": member_number, "pin": pin}, timeout=15)
    assert r.status_code == 200, f"socio login failed: {r.status_code} {r.text}"
    return s, r.json()["client"]


@pytest.fixture(scope="module")
def admin():
    return _login("admin@ard.pt", "admin123")


@pytest.fixture(scope="module")
def tesoureiro():
    return _login("tesoureiro@ard.pt", "tesoureiro123")


@pytest.fixture(scope="module")
def func():
    return _login("func1@ard.pt", "func123")


# =========================================================
# A. Funcionario create_client silently strips sensitive fields
# =========================================================
class TestFuncCreateClientStrips:
    def test_create_strips_is_member_member_number_pin(self, func):
        payload = {
            "name": f"TEST_iter4_strip_{uuid.uuid4().hex[:6]}",
            "contact": "910000111",
            "is_member": True,
            "member_number": f"STRIP{uuid.uuid4().hex[:5]}",
            "pin": "9999",
        }
        r = func.post(f"{API}/clients", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_member"] is False
        assert data.get("member_number") is None
        assert "pin_hash" not in data

    def test_admin_can_set_fields_via_post(self, admin):
        mn = f"ADM{uuid.uuid4().hex[:6]}"
        r = admin.post(f"{API}/clients", json={
            "name": f"TEST_iter4_admin_{uuid.uuid4().hex[:6]}",
            "is_member": True,
            "member_number": mn,
            "pin": "1234",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_member"] is True
        assert d["member_number"] == mn
        assert "pin_hash" not in d


# =========================================================
# B. Funcionario update_client perms
# =========================================================
class TestFuncUpdateClientPerms:
    @pytest.fixture(scope="class")
    def target(self, admin):
        r = admin.post(f"{API}/clients", json={
            "name": f"TEST_iter4_tgt_{uuid.uuid4().hex[:5]}",
            "contact": "910000222",
            "is_member": False,
        }, timeout=15)
        assert r.status_code == 200
        return r.json()

    def test_func_can_edit_contact_email_morada(self, func, target):
        r = func.put(f"{API}/clients/{target['id']}", json={
            "contact": "912345001", "email": "tgt@test.pt", "morada": "Rua A 1"
        }, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["contact"] == "912345001"
        assert c["email"] == "tgt@test.pt"
        assert c["morada"] == "Rua A 1"

    def test_func_forbidden_is_member(self, func, target):
        r = func.put(f"{API}/clients/{target['id']}", json={"is_member": True}, timeout=15)
        assert r.status_code == 403

    def test_func_forbidden_member_number(self, func, target):
        r = func.put(f"{API}/clients/{target['id']}", json={"member_number": "X1"}, timeout=15)
        assert r.status_code == 403

    def test_func_forbidden_pin(self, func, target):
        r = func.put(f"{API}/clients/{target['id']}", json={"pin": "0000"}, timeout=15)
        assert r.status_code == 403

    def test_admin_can_update_all(self, admin, target):
        mn = f"UPD{uuid.uuid4().hex[:5]}"
        r = admin.put(f"{API}/clients/{target['id']}", json={
            "is_member": True, "member_number": mn, "pin": "9999"
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_member"] is True
        assert d["member_number"] == mn
        assert "pin_hash" not in d


# =========================================================
# C. GET /admin/clients filters is_member=true
# =========================================================
class TestAdminClientsFilter:
    def test_only_members_returned(self, admin):
        r = admin.get(f"{API}/admin/clients", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) > 0, "Expected at least one sócio (Ana Ferreira)"
        for c in items:
            assert c.get("is_member") is True, f"non-member leaked: {c.get('name')}"

    def test_funcionario_forbidden(self, func):
        r = func.get(f"{API}/admin/clients", timeout=15)
        assert r.status_code == 403


# =========================================================
# D. Suppliers CRUD perms
# =========================================================
class TestSuppliersCRUD:
    def test_func_cannot_create(self, func):
        r = func.post(f"{API}/suppliers", json={"name": "TEST_iter4_func_sup"}, timeout=15)
        assert r.status_code == 403

    def test_tesoureiro_can_create(self, tesoureiro):
        r = tesoureiro.post(f"{API}/suppliers", json={
            "name": f"TEST_iter4_sup_{uuid.uuid4().hex[:5]}",
            "contact": "912000000", "nif": "500000001",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"].startswith("TEST_iter4_sup_")
        assert "id" in d
        pytest.iter4_sup_id = d["id"]  # share

    def test_list_includes_outstanding_and_orders_count(self, admin):
        r = admin.get(f"{API}/suppliers", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert all("outstanding" in s and "orders_count" in s for s in items)

    def test_update_admin_ok(self, admin):
        sid = pytest.iter4_sup_id
        r = admin.put(f"{API}/suppliers/{sid}", json={"contact": "913999999"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["contact"] == "913999999"

    def test_update_func_forbidden(self, func):
        sid = pytest.iter4_sup_id
        r = func.put(f"{API}/suppliers/{sid}", json={"contact": "X"}, timeout=15)
        assert r.status_code == 403

    def test_delete_tesoureiro_forbidden(self, tesoureiro):
        # create a throwaway with admin and try to delete with tesoureiro
        admin_sess = _login("admin@ard.pt", "admin123")
        r = admin_sess.post(f"{API}/suppliers", json={"name": f"TEST_iter4_del_{uuid.uuid4().hex[:5]}"}, timeout=15)
        sid = r.json()["id"]
        r2 = tesoureiro.delete(f"{API}/suppliers/{sid}", timeout=15)
        assert r2.status_code == 403
        # cleanup with admin
        admin_sess.delete(f"{API}/suppliers/{sid}", timeout=15)


# =========================================================
# E. Supplier Orders increment stock + payments
# =========================================================
class TestSupplierOrders:
    @pytest.fixture(scope="class")
    def product(self, admin):
        r = admin.post(f"{API}/products", json={
            "name": f"TEST_iter4_prod_{uuid.uuid4().hex[:5]}",
            "price": 1.0, "quantity": 10, "low_stock_threshold": 2,
            "category": "Bebida",
        }, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_unpaid_order_increments_stock(self, admin, product):
        sid = pytest.iter4_sup_id
        before_qty = product["quantity"]
        r = admin.post(f"{API}/supplier-orders", json={
            "supplier_id": sid,
            "items": [{"product_id": product["id"], "quantity": 20, "unit_cost": 0.5}],
            "paid": False,
        }, timeout=15)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["total"] == pytest.approx(10.0)
        assert order["balance_due"] == pytest.approx(10.0)
        assert order["paid"] is False
        # Verify stock increased
        plist = admin.get(f"{API}/products", timeout=15).json()
        p = next((x for x in plist if x["id"] == product["id"]), None)
        assert p["quantity"] == before_qty + 20
        pytest.iter4_unpaid_order = order["id"]

    def test_create_paid_order_increments_stock(self, admin, product):
        sid = pytest.iter4_sup_id
        plist = admin.get(f"{API}/products", timeout=15).json()
        before_qty = next(x for x in plist if x["id"] == product["id"])["quantity"]
        r = admin.post(f"{API}/supplier-orders", json={
            "supplier_id": sid,
            "items": [{"product_id": product["id"], "quantity": 5, "unit_cost": 0.4}],
            "paid": True,
        }, timeout=15)
        assert r.status_code == 200
        o = r.json()
        assert o["paid"] is True
        assert o["balance_due"] == 0
        plist2 = admin.get(f"{API}/products", timeout=15).json()
        after_qty = next(x for x in plist2 if x["id"] == product["id"])["quantity"]
        assert after_qty == before_qty + 5

    def test_pay_partial_then_full(self, admin):
        oid = pytest.iter4_unpaid_order
        # partial payment 4€
        r = admin.post(f"{API}/supplier-orders/{oid}/pay", json={"amount": 4.0}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["paid"] is False
        assert d["balance_due"] == pytest.approx(6.0)
        # exceed remaining -> 400
        r2 = admin.post(f"{API}/supplier-orders/{oid}/pay", json={"amount": 999.0}, timeout=15)
        assert r2.status_code == 400
        # exact remaining 6€
        r3 = admin.post(f"{API}/supplier-orders/{oid}/pay", json={"amount": 6.0}, timeout=15)
        assert r3.status_code == 200
        d3 = r3.json()
        assert d3["paid"] is True
        assert d3["balance_due"] == 0
        # already paid -> 400
        r4 = admin.post(f"{API}/supplier-orders/{oid}/pay", json={"amount": 1.0}, timeout=15)
        assert r4.status_code == 400


# =========================================================
# F. Pay with points
# =========================================================
class TestPayWithPoints:
    @pytest.fixture(scope="class")
    def member(self, admin):
        # Create a fresh sócio with points and debt for deterministic test
        mn = f"PTS{uuid.uuid4().hex[:5]}"
        r = admin.post(f"{API}/clients", json={
            "name": f"TEST_iter4_socio_{uuid.uuid4().hex[:5]}",
            "is_member": True, "member_number": mn, "pin": "1234",
        }, timeout=15)
        cid = r.json()["id"]
        # give debt by creating a small product + sale
        pr = admin.post(f"{API}/products", json={"name": f"TEST_iter4_pts_p_{uuid.uuid4().hex[:4]}", "price": 5.0, "quantity": 100}, timeout=15).json()
        # 4 sales of 1 unit each = 20€ debt, 4 points (1pt per 5€ for member)
        for _ in range(4):
            admin.post(f"{API}/sales", json={"client_id": cid, "items": [{"product_id": pr["id"], "quantity": 1}]}, timeout=15)
        # Manually boost points to 10 via direct update? We must go via API. Make 6 more sales = 10pts, 50€ debt
        for _ in range(6):
            admin.post(f"{API}/sales", json={"client_id": cid, "items": [{"product_id": pr["id"], "quantity": 1}]}, timeout=15)
        # Login as sócio
        sess, c = _socio_login(mn, "1234")
        assert c["points"] >= 10
        assert c["balance"] >= 10
        return sess, cid

    def test_pay_5_points_creates_payment_and_decrements(self, member, admin):
        sess, cid = member
        # current state
        before = admin.get(f"{API}/clients/{cid}", timeout=15).json()["client"]
        r = sess.post(f"{API}/socio/pay-with-points", json={"points": 5}, timeout=15)
        assert r.status_code == 200, r.text
        pay = r.json()
        assert pay["amount"] == pytest.approx(1.0)
        assert pay["points_used"] == 5
        assert pay["source"] == "points"
        after = admin.get(f"{API}/clients/{cid}", timeout=15).json()["client"]
        assert after["points"] == before["points"] - 5
        assert after["balance"] == pytest.approx(before["balance"] - 1.0, abs=0.01)

    def test_points_zero_or_negative_400(self, member):
        sess, _ = member
        assert sess.post(f"{API}/socio/pay-with-points", json={"points": 0}, timeout=15).status_code == 400
        assert sess.post(f"{API}/socio/pay-with-points", json={"points": -5}, timeout=15).status_code == 400

    def test_points_not_multiple_of_5(self, member):
        sess, _ = member
        r = sess.post(f"{API}/socio/pay-with-points", json={"points": 7}, timeout=15)
        assert r.status_code == 400
        assert "múltiplos" in r.json()["detail"].lower() or "multipl" in r.json()["detail"].lower()

    def test_points_insufficient(self, member):
        sess, _ = member
        r = sess.post(f"{API}/socio/pay-with-points", json={"points": 100000}, timeout=15)
        assert r.status_code == 400
        assert "insuficien" in r.json()["detail"].lower()

    def test_euros_exceed_debt(self, member, admin):
        sess, cid = member
        # Reduce debt close to 0 by paying it off via API payments
        c = admin.get(f"{API}/clients/{cid}", timeout=15).json()["client"]
        bal = c["balance"]
        if bal > 0:
            admin.post(f"{API}/payments", json={"client_id": cid, "amount": bal}, timeout=15)
        # Now debt=0. Any points request should 400 (exceeds debt)
        r = sess.post(f"{API}/socio/pay-with-points", json={"points": 5}, timeout=15)
        assert r.status_code == 400
