"""Iter 7 tests — is_quota flag, payment edit/delete, client/supplier reports."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inventory-bar-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
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


# ---------- (1) is_quota flag ----------
class TestQuotaFlag:
    def test_create_quota_product_excluded_from_stock_value_and_low_stock(self, admin):
        # baseline dashboard
        d0 = admin.get(f"{API}/dashboard").json()
        base_value = d0["total_stock_value"]
        base_low = len(d0["low_stock"])

        # Create cota product with low quantity (would trigger low stock if counted)
        payload = {
            "name": f"TEST_iter7_QUOTA_{uuid.uuid4().hex[:6]}",
            "price": 25.0,
            "quantity": 0,
            "low_stock_threshold": 5,
            "category": "Cotas",
            "is_quota": True,
        }
        r = admin.post(f"{API}/products", json=payload)
        assert r.status_code == 200, r.text
        prod = r.json()
        assert prod["is_quota"] is True
        pid = prod["id"]

        # Also create a NON-quota normal product to confirm it DOES count
        normal = admin.post(f"{API}/products", json={
            "name": f"TEST_iter7_NORMAL_{uuid.uuid4().hex[:6]}",
            "price": 10.0, "quantity": 3, "low_stock_threshold": 5,
            "category": "Bebida", "is_quota": False,
        }).json()

        d1 = admin.get(f"{API}/dashboard").json()
        # Quota value (25*0=0) shouldn't matter, but a quota with stock > 0 wouldn't count either.
        # Verify low_stock list does NOT contain quota even if qty<=threshold
        low_ids = [p["id"] for p in d1["low_stock"]]
        assert pid not in low_ids, "quota product should be excluded from low_stock"
        # Normal product with qty 3 <= threshold 5 should be in low_stock
        assert normal["id"] in low_ids, "normal product should appear in low_stock"

        # Increment quota qty and ensure stock value NOT counted
        admin.put(f"{API}/products/{pid}", json={"quantity": 10})
        d2 = admin.get(f"{API}/dashboard").json()
        # Difference from baseline should equal only normal product contribution (10*3=30)
        delta = d2["total_stock_value"] - base_value
        # delta must NOT include quota 25*10=250
        assert delta < 250, f"quota stock erroneously counted, delta={delta}"

        # cleanup
        admin.delete(f"{API}/products/{pid}")
        admin.delete(f"{API}/products/{normal['id']}")


# ---------- (2) Payment edit/delete ----------
class TestPaymentEditDelete:
    @pytest.fixture(scope="class")
    def setup_client_with_debt(self, admin):
        # Create a fresh test client and accumulate a debt via sale
        c = admin.post(f"{API}/clients", json={"name": f"TEST_iter7_CLI_{uuid.uuid4().hex[:6]}"}).json()
        # Create a product to sell
        p = admin.post(f"{API}/products", json={"name": f"TEST_iter7_SELLP_{uuid.uuid4().hex[:6]}",
                                                "price": 50.0, "quantity": 10, "low_stock_threshold": 1}).json()
        # Sale of 50€ (10€/u qty? price=50, qty=2 -> 100)
        sale = admin.post(f"{API}/sales", json={"client_id": c["id"],
                                                "items": [{"product_id": p["id"], "quantity": 2}]}).json()
        assert sale.get("total") == 100.0
        yield {"client_id": c["id"], "product_id": p["id"], "sale_id": sale["id"]}
        # Cleanup
        admin.delete(f"{API}/sales/{sale['id']}")
        admin.delete(f"{API}/clients/{c['id']}")
        admin.delete(f"{API}/products/{p['id']}")

    def test_funcionario_cannot_edit_payment(self, admin, funcionario, setup_client_with_debt):
        cid = setup_client_with_debt["client_id"]
        pay = admin.post(f"{API}/payments", json={"client_id": cid, "amount": 20.0, "note": "init"}).json()
        r = funcionario.put(f"{API}/payments/{pay['id']}", json={"amount": 30.0})
        assert r.status_code == 403
        r2 = funcionario.delete(f"{API}/payments/{pay['id']}")
        assert r2.status_code == 403
        # cleanup with admin
        admin.delete(f"{API}/payments/{pay['id']}")

    def test_admin_edit_payment_adjusts_balance(self, admin, setup_client_with_debt):
        cid = setup_client_with_debt["client_id"]
        before = admin.get(f"{API}/clients/{cid}").json()["client"]["balance"]
        pay = admin.post(f"{API}/payments", json={"client_id": cid, "amount": 30.0}).json()
        after_create = admin.get(f"{API}/clients/{cid}").json()["client"]["balance"]
        assert abs(after_create - (before - 30.0)) < 1e-6

        # Edit payment amount from 30 to 50 -> balance should decrease by additional 20
        r = admin.put(f"{API}/payments/{pay['id']}", json={"amount": 50.0, "note": "edited"})
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["amount"] == 50.0
        assert updated["note"] == "edited"
        after_edit = admin.get(f"{API}/clients/{cid}").json()["client"]["balance"]
        assert abs(after_edit - (after_create - 20.0)) < 1e-6, f"balance not adjusted: {after_edit} vs expected {after_create-20}"

        admin.delete(f"{API}/payments/{pay['id']}")

    def test_tesoureiro_delete_payment_restores_balance(self, admin, tesoureiro, setup_client_with_debt):
        cid = setup_client_with_debt["client_id"]
        before = admin.get(f"{API}/clients/{cid}").json()["client"]["balance"]
        pay = tesoureiro.post(f"{API}/payments", json={"client_id": cid, "amount": 15.0}).json()
        after_pay = admin.get(f"{API}/clients/{cid}").json()["client"]["balance"]
        assert abs(after_pay - (before - 15.0)) < 1e-6

        r = tesoureiro.delete(f"{API}/payments/{pay['id']}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["restored_balance"] == 15.0
        after_del = admin.get(f"{API}/clients/{cid}").json()["client"]["balance"]
        assert abs(after_del - before) < 1e-6


# ---------- (3) Client report ----------
class TestClientReport:
    def test_client_report_returns_filtered_sales_and_payments(self, admin):
        c = admin.post(f"{API}/clients", json={"name": f"TEST_iter7_REPCLI_{uuid.uuid4().hex[:6]}"}).json()
        p = admin.post(f"{API}/products", json={"name": f"TEST_iter7_RP_{uuid.uuid4().hex[:6]}",
                                                "price": 12.0, "quantity": 5, "low_stock_threshold": 1}).json()
        sale = admin.post(f"{API}/sales", json={"client_id": c["id"],
                                                "items": [{"product_id": p["id"], "quantity": 1}]}).json()
        pay = admin.post(f"{API}/payments", json={"client_id": c["id"], "amount": 5.0}).json()

        # full-range
        r = admin.get(f"{API}/reports/client/{c['id']}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "client" in data and data["client"]["id"] == c["id"]
        assert "period" in data
        assert "generated_at" in data
        assert "club_name" in data
        assert data["totals"]["sales"] >= 12.0
        assert data["totals"]["paid"] >= 5.0
        assert data["totals"]["diff"] == data["totals"]["sales"] - data["totals"]["paid"]
        # ensure sale & payment present
        assert any(s["id"] == sale["id"] for s in data["sales"])
        assert any(p_["id"] == pay["id"] for p_ in data["payments"])

        # date filter that excludes today
        r2 = admin.get(f"{API}/reports/client/{c['id']}?date_from=2099-01-01&date_to=2099-12-31")
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["totals"]["sales"] == 0
        assert d2["totals"]["paid"] == 0
        assert d2["sales"] == []
        assert d2["payments"] == []

        # cleanup
        admin.delete(f"{API}/payments/{pay['id']}")
        admin.delete(f"{API}/sales/{sale['id']}")
        admin.delete(f"{API}/products/{p['id']}")
        admin.delete(f"{API}/clients/{c['id']}")

    def test_client_report_404_on_unknown(self, admin):
        r = admin.get(f"{API}/reports/client/{uuid.uuid4()}")
        assert r.status_code == 404


# ---------- (4) Supplier report ----------
class TestSupplierReport:
    def test_supplier_report_returns_orders_and_expenses(self, admin):
        sup = admin.post(f"{API}/suppliers", json={"name": f"TEST_iter7_SUP_{uuid.uuid4().hex[:6]}"}).json()
        prod = admin.post(f"{API}/products", json={"name": f"TEST_iter7_SP_{uuid.uuid4().hex[:6]}",
                                                   "price": 5.0, "quantity": 0, "low_stock_threshold": 1}).json()
        order = admin.post(f"{API}/supplier-orders", json={
            "supplier_id": sup["id"], "paid": False,
            "items": [{"product_id": prod["id"], "quantity": 3, "unit_cost": 4.0}]
        }).json()
        assert order.get("balance_due") == 12.0

        expense = admin.post(f"{API}/supplier-expenses", json={
            "supplier_id": sup["id"], "description": "TEST_iter7 renda", "amount": 100.0, "paid": False
        }).json()

        r = admin.get(f"{API}/reports/supplier/{sup['id']}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["supplier"]["id"] == sup["id"]
        assert "generated_at" in data and "club_name" in data
        t = data["totals"]
        assert t["orders"] == 12.0
        assert t["debt_orders"] == 12.0
        assert t["debt_expenses"] == 100.0
        assert t["total_debt"] == 112.0
        assert any(o["id"] == order["id"] for o in data["orders"])
        assert any(e["id"] == expense["id"] for e in data["expenses"])

        # date filter exclusion
        r2 = admin.get(f"{API}/reports/supplier/{sup['id']}?date_from=2099-01-01")
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["totals"]["total_debt"] == 0

        # cleanup
        admin.delete(f"{API}/supplier-expenses/{expense['id']}")
        # supplier_orders has no delete endpoint; we just delete supplier (orders remain orphan, acceptable for test cleanup)
        admin.delete(f"{API}/products/{prod['id']}")
        admin.delete(f"{API}/suppliers/{sup['id']}")

    def test_supplier_report_404_on_unknown(self, admin):
        r = admin.get(f"{API}/reports/supplier/{uuid.uuid4()}")
        assert r.status_code == 404
