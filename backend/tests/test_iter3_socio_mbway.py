"""Iteration 3 backend tests: sócio portal, PIN, MBWay manual flow, club info, morada."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"


# ---------- helpers ----------
def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    _login(s, "admin@ard.pt", "admin123")
    return s


@pytest.fixture(scope="module")
def tesoureiro():
    s = requests.Session()
    _login(s, "tesoureiro@ard.pt", "tesoureiro123")
    return s


@pytest.fixture(scope="module")
def funcionario():
    s = requests.Session()
    _login(s, "func1@ard.pt", "func123")
    return s


@pytest.fixture(scope="module")
def test_client_id(admin):
    """Create a sócio test client with PIN and member_number."""
    mn = f"TEST{int(time.time())%100000}"
    body = {
        "name": "TEST_iter3_Socio",
        "contact": "912000000",
        "email": "test_iter3@example.com",
        "is_member": True,
        "member_number": mn,
        "morada": "Rua de Testes 1",
        "pin": "4321",
    }
    r = admin.post(f"{API}/clients", json=body)
    assert r.status_code == 200, r.text
    c = r.json()
    assert "pin_hash" not in c, "pin_hash must not be returned"
    return {"id": c["id"], "member_number": mn, "pin": "4321"}


# ---------- Club Info (public) ----------
class TestClubInfo:
    def test_club_info_no_auth(self):
        r = requests.get(f"{API}/club/info")
        assert r.status_code == 200
        data = r.json()
        assert "name" in data and "mbway_phone" in data
        assert data["mbway_phone"] == "+351 912 345 678"


# ---------- Sócio login ----------
class TestSocioLogin:
    def test_login_success(self, test_client_id):
        s = requests.Session()
        r = s.post(f"{API}/socio/login",
                   json={"member_number": test_client_id["member_number"], "pin": "4321"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "client" in data
        assert data["client"]["member_number"] == test_client_id["member_number"]
        assert "pin_hash" not in data["client"]
        assert s.cookies.get("socio_token"), "socio_token cookie not set"

    def test_login_wrong_pin(self, test_client_id):
        s = requests.Session()
        r = s.post(f"{API}/socio/login",
                   json={"member_number": test_client_id["member_number"], "pin": "0000"})
        assert r.status_code == 401

    def test_login_no_pin_member(self, admin):
        # create member without pin
        mn = f"NP{int(time.time())%100000}"
        rc = admin.post(f"{API}/clients",
                        json={"name": "TEST_iter3_noPin", "member_number": mn, "is_member": True})
        assert rc.status_code == 200
        s = requests.Session()
        r = s.post(f"{API}/socio/login", json={"member_number": mn, "pin": "1234"})
        assert r.status_code == 401

    def test_login_known_ana_ferreira(self):
        s = requests.Session()
        r = s.post(f"{API}/socio/login", json={"member_number": "1982", "pin": "1234"})
        assert r.status_code == 200, r.text
        assert s.cookies.get("socio_token")


# ---------- Sócio me ----------
class TestSocioMe:
    def test_me_returns_history(self, test_client_id):
        s = requests.Session()
        r = s.post(f"{API}/socio/login",
                   json={"member_number": test_client_id["member_number"], "pin": "4321"})
        assert r.status_code == 200
        r2 = s.get(f"{API}/socio/me")
        assert r2.status_code == 200
        data = r2.json()
        for k in ("client", "sales", "payments", "mbway"):
            assert k in data
        assert "pin_hash" not in data["client"]

    def test_me_requires_socio_token(self):
        r = requests.get(f"{API}/socio/me")
        assert r.status_code == 401

    def test_staff_access_token_does_not_work_on_socio_me(self, admin):
        # staff has access_token but not socio_token → should 401
        r = admin.get(f"{API}/socio/me")
        assert r.status_code == 401

    def test_update_me_only_allowed_fields(self, test_client_id, admin):
        s = requests.Session()
        s.post(f"{API}/socio/login",
               json={"member_number": test_client_id["member_number"], "pin": "4321"})
        r = s.put(f"{API}/socio/me",
                  json={"contact": "913111222", "email": "novo@example.com",
                        "morada": "Rua Nova 42"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["contact"] == "913111222"
        assert body["email"] == "novo@example.com"
        assert body["morada"] == "Rua Nova 42"
        assert "pin_hash" not in body
        # name should NOT have changed - SocioUpdateIn ignores it
        rc = admin.get(f"{API}/clients/{test_client_id['id']}")
        assert rc.status_code == 200
        assert rc.json()["client"]["name"] == "TEST_iter3_Socio"


# ---------- MBWay flow ----------
class TestMBWayFlow:
    def test_full_flow_request_confirm(self, test_client_id, admin):
        # set balance via sale? simpler: add a payment of negative? No, use sale.
        # Easier: just check balance decrement by reading before/after.
        # Inject a sale first to give them balance.
        # Use admin to find a product:
        prods = admin.get(f"{API}/products").json()
        assert prods, "need at least one product"
        prod = prods[0]
        # Use a small qty
        r_sale = admin.post(f"{API}/sales", json={
            "client_id": test_client_id["id"],
            "items": [{"product_id": prod["id"], "quantity": 1}],
        })
        assert r_sale.status_code == 200, r_sale.text
        balance_before = admin.get(
            f"{API}/clients/{test_client_id['id']}").json()["client"]["balance"]
        assert balance_before >= prod["price"] - 0.01

        # Sócio logs in and requests MBWay
        s = requests.Session()
        s.post(f"{API}/socio/login",
               json={"member_number": test_client_id["member_number"], "pin": "4321"})
        req_amount = round(prod["price"], 2)
        r_req = s.post(f"{API}/socio/mbway-request",
                       json={"amount": req_amount, "mbway_phone": "912345678",
                             "note": "test_iter3"})
        assert r_req.status_code == 200, r_req.text
        mb = r_req.json()
        assert mb["status"] == "pending"
        mb_id = mb["id"]

        # Staff lists pending
        r_list = admin.get(f"{API}/mbway-payments", params={"status_filter": "pending"})
        assert r_list.status_code == 200
        assert any(x["id"] == mb_id for x in r_list.json())

        # Admin confirms
        r_conf = admin.post(f"{API}/mbway-payments/{mb_id}/confirm")
        assert r_conf.status_code == 200, r_conf.text
        body = r_conf.json()
        assert body["ok"] is True
        assert body["payment"]["amount"] == req_amount

        # Balance decremented
        balance_after = admin.get(
            f"{API}/clients/{test_client_id['id']}").json()["client"]["balance"]
        assert abs(balance_after - (balance_before - req_amount)) < 0.01, \
            f"expected {balance_before - req_amount}, got {balance_after}"

        # Can't confirm twice
        r2 = admin.post(f"{API}/mbway-payments/{mb_id}/confirm")
        assert r2.status_code == 400

    def test_reject_flow_and_funcionario_can_confirm(self, test_client_id, funcionario):
        # sócio request
        s = requests.Session()
        s.post(f"{API}/socio/login",
               json={"member_number": test_client_id["member_number"], "pin": "4321"})
        r1 = s.post(f"{API}/socio/mbway-request",
                    json={"amount": 1.00, "mbway_phone": "912345678"})
        assert r1.status_code == 200
        mb_id1 = r1.json()["id"]
        # funcionario rejects
        rr = funcionario.post(f"{API}/mbway-payments/{mb_id1}/reject")
        assert rr.status_code == 200, rr.text

        # second request, funcionario confirms
        r2 = s.post(f"{API}/socio/mbway-request",
                    json={"amount": 0.50, "mbway_phone": "912345678"})
        assert r2.status_code == 200
        mb_id2 = r2.json()["id"]
        rc = funcionario.post(f"{API}/mbway-payments/{mb_id2}/confirm")
        assert rc.status_code == 200, rc.text

    def test_mbway_list_requires_auth(self):
        r = requests.get(f"{API}/mbway-payments")
        assert r.status_code == 401


# ---------- PIN permissions ----------
class TestClientPin:
    def test_admin_sets_pin_and_pin_hash_not_returned(self, admin, test_client_id):
        r = admin.put(f"{API}/clients/{test_client_id['id']}", json={"pin": "9999"})
        assert r.status_code == 200, r.text
        assert "pin_hash" not in r.json()
        # GET list and detail must not include pin_hash
        lst = admin.get(f"{API}/clients").json()
        for c in lst:
            assert "pin_hash" not in c
        det = admin.get(f"{API}/clients/{test_client_id['id']}").json()
        assert "pin_hash" not in det["client"]
        # restore pin
        admin.put(f"{API}/clients/{test_client_id['id']}", json={"pin": "4321"})

    def test_tesoureiro_can_set_pin(self, tesoureiro, test_client_id):
        r = tesoureiro.put(f"{API}/clients/{test_client_id['id']}", json={"pin": "4321"})
        assert r.status_code == 200

    def test_funcionario_cannot_set_pin(self, funcionario, test_client_id):
        r = funcionario.put(f"{API}/clients/{test_client_id['id']}", json={"pin": "1111"})
        assert r.status_code == 403

    def test_funcionario_can_edit_morada(self, funcionario, test_client_id, admin):
        r = funcionario.put(f"{API}/clients/{test_client_id['id']}",
                            json={"morada": "Rua Func 1"})
        assert r.status_code == 200, r.text
        det = admin.get(f"{API}/clients/{test_client_id['id']}").json()
        assert det["client"]["morada"] == "Rua Func 1"

    def test_funcionario_cannot_edit_name(self, funcionario, test_client_id):
        r = funcionario.put(f"{API}/clients/{test_client_id['id']}",
                            json={"name": "Hacked"})
        assert r.status_code == 403


# ---------- create client with morada ----------
class TestCreateClientMorada:
    def test_create_with_morada(self, admin):
        r = admin.post(f"{API}/clients",
                       json={"name": "TEST_iter3_morada", "morada": "Rua Teste 99"})
        assert r.status_code == 200
        assert r.json()["morada"] == "Rua Teste 99"
