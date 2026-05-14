"""
Iteration 10 tests:
- Backfill tx_number across all transactional collections
- GET /api/transactions/{tx_number} for tx_numbers 1..207
- New endpoint GET /api/socio/products
- POST /api/socio/consumption-request still works
- POST /api/sales assigns incremental tx_number
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@ard.pt", "password": "admin123"}
SOCIO = {"member_number": "88", "pin": "00088"}


# ----- fixtures -----
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def socio_session():
    s = requests.Session()
    r = s.post(f"{API}/socio/login", json=SOCIO, timeout=15)
    assert r.status_code == 200, f"socio login failed: {r.status_code} {r.text}"
    return s


# ----- 1) Backfill: GET /api/transactions/{tx_number} for 1..207 -----
class TestBackfillTxNumber:
    def test_early_backfilled_tx_resolves(self, admin_session):
        # tx_number=2 is the first backfilled record (counter pre-existed at seq=1)
        r = admin_session.get(f"{API}/transactions/2", timeout=15)
        assert r.status_code == 200, f"tx 2 not found: {r.status_code} {r.text}"
        data = r.json()
        assert "_kind" in data
        assert data["_kind"] in ("sale", "payment", "order", "expense")
        assert data.get("tx_number") == 2

    def test_last_backfilled_tx_resolves(self, admin_session):
        # Last backfilled tx is 208 (207 records + counter started at 1)
        r = admin_session.get(f"{API}/transactions/208", timeout=15)
        assert r.status_code == 200, f"tx 208 not found: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("tx_number") == 208
        assert data["_kind"] in ("sale", "payment", "order", "expense")

    def test_no_transaction_without_tx_number_in_db(self, admin_session):
        """Critical guarantee: every backfilled tx_number from 2..208 resolves; none missing."""
        missing = []
        # Range covers all 207 backfilled transactions (2..208 inclusive).
        for n in range(2, 209):
            r = admin_session.get(f"{API}/transactions/{n}", timeout=10)
            if r.status_code != 200:
                missing.append((n, r.status_code))
        assert not missing, f"Missing tx_numbers (holes): {missing[:10]} total={len(missing)}"

    def test_unknown_tx_number_returns_404(self, admin_session):
        r = admin_session.get(f"{API}/transactions/99999", timeout=10)
        assert r.status_code == 404


# ----- 2) New sale creates incremental tx_number (counter > 207) -----
class TestNewSaleTxNumber:
    def test_new_sale_gets_tx_above_max(self, admin_session):
        # find a product with stock and a client
        prods = admin_session.get(f"{API}/products", timeout=10).json()
        cands = [p for p in prods if not p.get("is_quota") and p.get("quantity", 0) > 0]
        assert cands, "no stocked non-quota product"
        prod = cands[0]
        clients = admin_session.get(f"{API}/clients", timeout=10).json()
        assert clients, "no client"
        client = clients[0]

        payload = {
            "client_id": client["id"],
            "items": [{"product_id": prod["id"], "quantity": 1}],
            "pay_now": False,
        }
        r = admin_session.post(f"{API}/sales", json=payload, timeout=15)
        assert r.status_code in (200, 201), f"sale create failed: {r.status_code} {r.text}"
        sale = r.json()
        # may be wrapped under {"sale": ...} or returned directly
        sale_obj = sale.get("sale") if isinstance(sale, dict) and "sale" in sale else sale
        tx = sale_obj.get("tx_number")
        assert tx is not None, f"sale has no tx_number: {sale_obj}"
        assert tx >= 208, f"expected tx >= 208 (after backfill), got {tx}"

        # GET via /transactions/{tx_number} works
        r2 = admin_session.get(f"{API}/transactions/{tx}", timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("tx_number") == tx

        # cleanup: cancel the sale to restore stock
        sid = sale_obj.get("id")
        if sid:
            admin_session.post(f"{API}/sales/{sid}/cancel", timeout=10)


# ----- 3) GET /api/socio/products -----
class TestSocioProducts:
    def test_socio_products_requires_auth(self):
        # clean session, no socio_token
        r = requests.get(f"{API}/socio/products", timeout=10)
        assert r.status_code == 401

    def test_socio_products_returns_list(self, socio_session):
        r = socio_session.get(f"{API}/socio/products", timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        items = r.json()
        assert isinstance(items, list)
        assert len(items) > 0, "socio products list empty"
        for p in items:
            assert p.get("quantity", 0) > 0, f"product with no stock leaked: {p.get('name')}"
            assert not p.get("is_quota"), f"quota product leaked: {p.get('name')}"
            assert "id" in p and "name" in p and "price" in p
            assert "_id" not in p, "mongo _id leaked"


# ----- 4) POST /api/socio/consumption-request still works -----
class TestSocioConsumptionRequest:
    def test_consumption_request_create(self, socio_session):
        prods = socio_session.get(f"{API}/socio/products", timeout=10).json()
        assert prods, "no products to request"
        prod = prods[0]
        payload = {
            "items": [{"product_id": prod["id"], "quantity": 1}],
            "note": "TEST_iter10 pedido consumo",
        }
        r = socio_session.post(f"{API}/socio/consumption-request", json=payload, timeout=15)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        data = r.json()
        # may be {"request": {...}} or the doc directly
        req = data.get("request") if isinstance(data, dict) and "request" in data else data
        assert req.get("status") == "pending"
        assert req.get("total") and req["total"] > 0
        assert "_id" not in req

    def test_consumption_request_rejects_empty(self, socio_session):
        r = socio_session.post(f"{API}/socio/consumption-request", json={"items": []}, timeout=10)
        assert r.status_code in (400, 422)
