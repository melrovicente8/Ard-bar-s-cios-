"""
Iter 6 backend tests:
- DELETE /api/sales/{id}: restock + decrement client balance/total_spent/points (admin/tesoureiro only)
- GET /api/dashboard returns week_sales_total, month_sales_total, suppliers_debt(_orders/_expenses), today_debtors_count
- GET /api/clients/{id} returns consumption {day, week, month, year}
- GET /api/clients-with-debt returns clients with balance>0 sorted desc
- Supplier expenses CRUD (admin/tesoureiro), DELETE admin only, list sorted by due_date, toggle paid auto-sets paid_at
"""
import os
import time
import uuid
import requests
import pytest

_BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not _BASE:
    # fallback: read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    _BASE = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
assert _BASE, "REACT_APP_BACKEND_URL not set"
BASE_URL = _BASE.rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
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


# ---------- helpers ----------
def _create_product(admin, price=2.50, qty=20):
    suffix = uuid.uuid4().hex[:6]
    r = admin.post(f"{API}/products", json={
        "name": f"TEST_iter6_Prod_{suffix}",
        "price": price,
        "quantity": qty,
        "low_stock_threshold": 1,
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _create_client(admin, is_member=False, balance=0):
    suffix = uuid.uuid4().hex[:6]
    r = admin.post(f"{API}/clients", json={
        "name": f"TEST_iter6_Client_{suffix}",
        "is_member": is_member,
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ============================================================
# DELETE /api/sales/{id}
# ============================================================
class TestCancelSale:
    def test_cancel_sale_restores_stock_balance_points(self, admin):
        prod = _create_product(admin, price=5.00, qty=10)
        client = _create_client(admin, is_member=True)
        # Create a sale: 2 units * 5€ = 10€ → 2 points (sócio: 5€/pt)
        r = admin.post(f"{API}/sales", json={
            "client_id": client["id"],
            "items": [{"product_id": prod["id"], "quantity": 2}],
        }, timeout=15)
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["total"] == 10.0
        assert sale["points_earned"] == 2

        # verify stock decremented and client updated
        p_after = admin.get(f"{API}/products", timeout=10).json()
        my_prod = [p for p in p_after if p["id"] == prod["id"]][0]
        assert my_prod["quantity"] == 8

        c_after = admin.get(f"{API}/clients/{client['id']}", timeout=10).json()["client"]
        assert abs(c_after["balance"] - 10.0) < 1e-6
        assert abs(c_after["total_spent"] - 10.0) < 1e-6
        assert c_after["points"] == 2

        # DELETE sale
        r = admin.delete(f"{API}/sales/{sale['id']}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert abs(body.get("restored_total", 0) - 10.0) < 1e-6
        assert body.get("restored_points") == 2

        # verify restock + client restored
        p_after2 = admin.get(f"{API}/products", timeout=10).json()
        my_prod2 = [p for p in p_after2 if p["id"] == prod["id"]][0]
        assert my_prod2["quantity"] == 10

        c_after2 = admin.get(f"{API}/clients/{client['id']}", timeout=10).json()["client"]
        assert abs(c_after2["balance"]) < 1e-6
        assert abs(c_after2["total_spent"]) < 1e-6
        assert c_after2["points"] == 0

        # GET sale by listing → should be gone
        sales = admin.get(f"{API}/sales", timeout=10).json()
        assert not any(s["id"] == sale["id"] for s in sales)

    def test_cancel_sale_funcionario_forbidden(self, admin, funcionario):
        prod = _create_product(admin, price=3.00, qty=5)
        client = _create_client(admin)
        sale = admin.post(f"{API}/sales", json={
            "client_id": client["id"],
            "items": [{"product_id": prod["id"], "quantity": 1}],
        }, timeout=15).json()
        r = funcionario.delete(f"{API}/sales/{sale['id']}", timeout=15)
        assert r.status_code == 403

    def test_cancel_sale_tesoureiro_allowed(self, admin, tesoureiro):
        prod = _create_product(admin, price=2.00, qty=5)
        client = _create_client(admin)
        sale = admin.post(f"{API}/sales", json={
            "client_id": client["id"],
            "items": [{"product_id": prod["id"], "quantity": 1}],
        }, timeout=15).json()
        r = tesoureiro.delete(f"{API}/sales/{sale['id']}", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

    def test_cancel_sale_not_found(self, admin):
        r = admin.delete(f"{API}/sales/non-existent-id-xyz", timeout=15)
        assert r.status_code == 404


# ============================================================
# Dashboard new fields
# ============================================================
class TestDashboardKPIs:
    def test_dashboard_has_new_fields(self, admin):
        r = admin.get(f"{API}/dashboard", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in [
            "week_sales_total", "month_sales_total",
            "suppliers_debt", "suppliers_debt_orders", "suppliers_debt_expenses",
            "today_debtors_count", "outstanding_debt", "today_sales_total",
        ]:
            assert key in d, f"missing field {key}"
        assert isinstance(d["week_sales_total"], (int, float))
        assert isinstance(d["month_sales_total"], (int, float))
        assert isinstance(d["today_debtors_count"], int)
        # debt = orders + expenses
        assert abs(d["suppliers_debt"] - (d["suppliers_debt_orders"] + d["suppliers_debt_expenses"])) < 1e-6


# ============================================================
# Client consumption breakdown
# ============================================================
class TestClientConsumption:
    def test_client_detail_has_consumption(self, admin):
        client = _create_client(admin)
        prod = _create_product(admin, price=4.00, qty=10)
        admin.post(f"{API}/sales", json={
            "client_id": client["id"],
            "items": [{"product_id": prod["id"], "quantity": 1}],
        }, timeout=15).raise_for_status()

        r = admin.get(f"{API}/clients/{client['id']}", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "consumption" in d
        cons = d["consumption"]
        for k in ["day", "week", "month", "year"]:
            assert k in cons
            assert isinstance(cons[k], (int, float))
        # at least today's 4€ should be in day/week/month/year
        assert cons["day"] >= 4.0
        assert cons["week"] >= 4.0
        assert cons["month"] >= 4.0
        assert cons["year"] >= 4.0


# ============================================================
# /api/clients-with-debt
# ============================================================
class TestClientsWithDebt:
    def test_returns_only_debtors_sorted_desc(self, admin):
        # create 2 clients with different debts
        c1 = _create_client(admin)
        c2 = _create_client(admin)
        p = _create_product(admin, price=3.00, qty=20)
        admin.post(f"{API}/sales", json={"client_id": c1["id"], "items": [{"product_id": p["id"], "quantity": 1}]}, timeout=15)  # 3€
        admin.post(f"{API}/sales", json={"client_id": c2["id"], "items": [{"product_id": p["id"], "quantity": 3}]}, timeout=15)  # 9€

        r = admin.get(f"{API}/clients-with-debt", timeout=15)
        assert r.status_code == 200
        debtors = r.json()
        assert isinstance(debtors, list)
        # all returned must have balance > 0
        assert all(c.get("balance", 0) > 0 for c in debtors)
        # sorted desc
        balances = [c["balance"] for c in debtors]
        assert balances == sorted(balances, reverse=True)
        # both our clients should be present
        ids = {c["id"] for c in debtors}
        assert c1["id"] in ids and c2["id"] in ids
        # _id should never leak
        assert not any("_id" in c for c in debtors)


# ============================================================
# Supplier Expenses CRUD
# ============================================================
class TestSupplierExpenses:
    def test_funcionario_cannot_create(self, funcionario):
        r = funcionario.post(f"{API}/supplier-expenses", json={
            "description": "TEST_iter6_exp_func",
            "amount": 50,
            "due_date": "2026-02-01",
            "paid": False,
            "recurring": "monthly",
        }, timeout=15)
        assert r.status_code == 403

    def test_admin_creates_and_get_list_sorted(self, admin):
        # create 2 expenses with different due_dates
        r1 = admin.post(f"{API}/supplier-expenses", json={
            "description": f"TEST_iter6_exp_A_{uuid.uuid4().hex[:4]}",
            "amount": 100.0,
            "due_date": "2026-03-15",
            "paid": False,
            "recurring": "monthly",
        }, timeout=15)
        assert r1.status_code == 200, r1.text
        e1 = r1.json()
        assert e1["paid"] is False
        assert e1["paid_at"] is None
        assert e1["recurring"] == "monthly"
        assert e1["amount"] == 100.0

        r2 = admin.post(f"{API}/supplier-expenses", json={
            "description": f"TEST_iter6_exp_B_{uuid.uuid4().hex[:4]}",
            "amount": 30.0,
            "due_date": "2026-02-10",
            "paid": False,
            "recurring": "yearly",
        }, timeout=15)
        assert r2.status_code == 200, r2.text

        # list sorted by due_date asc
        lst = admin.get(f"{API}/supplier-expenses", timeout=15).json()
        my = [e for e in lst if e["id"] in (e1["id"], r2.json()["id"])]
        assert len(my) == 2
        dates = [e["due_date"] for e in my]
        # ensure overall list is sorted asc by due_date
        all_dates = [e.get("due_date", "") for e in lst]
        assert all_dates == sorted(all_dates)

    def test_toggle_paid_sets_paid_at(self, admin):
        r = admin.post(f"{API}/supplier-expenses", json={
            "description": f"TEST_iter6_exp_T_{uuid.uuid4().hex[:4]}",
            "amount": 12.34,
            "due_date": "2026-04-01",
            "paid": False,
            "recurring": "monthly",
        }, timeout=15)
        eid = r.json()["id"]

        # toggle to paid → paid_at should be set
        up = admin.put(f"{API}/supplier-expenses/{eid}", json={"paid": True}, timeout=15)
        assert up.status_code == 200, up.text
        b = up.json()
        assert b["paid"] is True
        assert b["paid_at"] is not None and len(b["paid_at"]) > 0

        # toggle back to unpaid → paid_at cleared
        up2 = admin.put(f"{API}/supplier-expenses/{eid}", json={"paid": False}, timeout=15)
        assert up2.status_code == 200, up2.text
        b2 = up2.json()
        assert b2["paid"] is False
        assert b2["paid_at"] is None

    def test_tesoureiro_can_create_and_update_but_not_delete(self, admin, tesoureiro):
        r = tesoureiro.post(f"{API}/supplier-expenses", json={
            "description": f"TEST_iter6_exp_Tes_{uuid.uuid4().hex[:4]}",
            "amount": 22.0,
            "due_date": "2026-05-05",
            "paid": False,
            "recurring": "monthly",
        }, timeout=15)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]

        up = tesoureiro.put(f"{API}/supplier-expenses/{eid}", json={"amount": 25.0}, timeout=15)
        assert up.status_code == 200
        assert up.json()["amount"] == 25.0

        # tesoureiro cannot delete
        d = tesoureiro.delete(f"{API}/supplier-expenses/{eid}", timeout=15)
        assert d.status_code == 403

        # admin deletes
        d2 = admin.delete(f"{API}/supplier-expenses/{eid}", timeout=15)
        assert d2.status_code == 200
        assert d2.json()["ok"] is True

    def test_dashboard_suppliers_debt_aggregates_expenses(self, admin):
        # snapshot
        d0 = admin.get(f"{API}/dashboard", timeout=15).json()
        debt0 = d0["suppliers_debt"]
        exp_debt0 = d0["suppliers_debt_expenses"]

        # create unpaid expense 77€
        r = admin.post(f"{API}/supplier-expenses", json={
            "description": f"TEST_iter6_exp_DASH_{uuid.uuid4().hex[:4]}",
            "amount": 77.0,
            "due_date": "2026-06-01",
            "paid": False,
            "recurring": "monthly",
        }, timeout=15)
        assert r.status_code == 200
        eid = r.json()["id"]

        d1 = admin.get(f"{API}/dashboard", timeout=15).json()
        assert abs(d1["suppliers_debt_expenses"] - (exp_debt0 + 77.0)) < 1e-6
        assert abs(d1["suppliers_debt"] - (debt0 + 77.0)) < 1e-6

        # cleanup
        admin.delete(f"{API}/supplier-expenses/{eid}", timeout=15)
