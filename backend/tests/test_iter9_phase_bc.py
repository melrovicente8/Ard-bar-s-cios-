"""Iter 9 — Phase B+C: keep_change_as_credit, club info, quotas (staff+sócio),
reports/sales filters, audit-log, points-history, socio rollover, sale edit audit changes."""
import os
import uuid
import time
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


def _make_client_with_debt(admin, debt=20.0, is_member=False):
    cname = f"TEST_iter9_{uuid.uuid4().hex[:6]}"
    payload = {"name": cname, "is_member": is_member}
    if is_member:
        mn = str(90000 + (uuid.uuid4().int % 9999))
        payload["member_number"] = mn
    c = admin.post(f"{API}/clients", json=payload).json()
    p = admin.post(f"{API}/products", json={
        "name": f"TEST_iter9_p_{uuid.uuid4().hex[:6]}",
        "price": debt, "quantity": 50, "low_stock_threshold": 1
    }).json()
    sale = admin.post(f"{API}/sales", json={
        "client_id": c["id"],
        "items": [{"product_id": p["id"], "quantity": 1}]
    }).json()
    return c, p, sale


# ---------- Payment keep_change_as_credit ----------
class TestPaymentChangeBehavior:
    def test_payment_default_caps_at_debt(self, admin):
        c, p, sale = _make_client_with_debt(admin, debt=20.0)
        # Pay 30 € → debt=20, default keep_change_as_credit=False
        r = admin.post(f"{API}/payments", json={"client_id": c["id"], "amount": 30.0})
        assert r.status_code == 200, r.text
        pay = r.json()
        assert pay["total_credited"] == 20.0, f"expected cap at 20, got {pay['total_credited']}"
        assert pay["change_returned"] == 10.0
        assert pay["keep_change_as_credit"] is False
        bal = admin.get(f"{API}/clients/{c['id']}").json()["client"]["balance"]
        assert abs(bal - 0.0) < 1e-6, f"balance should be 0, got {bal}"
        # cleanup
        admin.delete(f"{API}/payments/{pay['id']}")
        admin.delete(f"{API}/sales/{sale['id']}")
        admin.delete(f"{API}/products/{p['id']}")
        admin.delete(f"{API}/clients/{c['id']}")

    def test_payment_keep_change_as_credit_true(self, admin):
        c, p, sale = _make_client_with_debt(admin, debt=20.0)
        r = admin.post(f"{API}/payments", json={
            "client_id": c["id"], "amount": 30.0, "keep_change_as_credit": True
        })
        assert r.status_code == 200, r.text
        pay = r.json()
        assert pay["total_credited"] == 30.0
        assert pay["change_returned"] == 0.0
        assert pay["keep_change_as_credit"] is True
        bal = admin.get(f"{API}/clients/{c['id']}").json()["client"]["balance"]
        assert abs(bal - (-10.0)) < 1e-6, f"balance should be -10 (crédito), got {bal}"
        admin.delete(f"{API}/payments/{pay['id']}")
        admin.delete(f"{API}/sales/{sale['id']}")
        admin.delete(f"{API}/products/{p['id']}")
        admin.delete(f"{API}/clients/{c['id']}")


# ---------- Club info ----------
class TestClubInfo:
    def test_club_info_returns_mbway_and_quota(self):
        r = requests.get(f"{API}/club/info", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("mbway_phone") == "968265272"
        assert float(d.get("quota_monthly_value", 0)) == 5.0


# ---------- Quotas (staff) ----------
class TestQuotasStaff:
    def test_get_client_quotas_returns_12_entries(self, admin):
        c = admin.post(f"{API}/clients", json={
            "name": f"TEST_iter9_quota_{uuid.uuid4().hex[:6]}",
            "is_member": True,
            "member_number": str(91000 + (uuid.uuid4().int % 999)),
        }).json()
        r = admin.get(f"{API}/clients/{c['id']}/quotas?year=2026")
        assert r.status_code == 200, r.text
        data = r.json()
        items = data["quotas"]
        assert len(items) == 12, f"expected 12 months, got {len(items)}"
        statuses = {it.get("status") for it in items}
        assert statuses.issubset({"open", "paid"})
        admin.delete(f"{API}/clients/{c['id']}")

    def test_staff_pay_quotas_creates_sale_and_payment(self, admin):
        c = admin.post(f"{API}/clients", json={
            "name": f"TEST_iter9_quotapay_{uuid.uuid4().hex[:6]}",
            "is_member": True,
            "member_number": str(92000 + (uuid.uuid4().int % 999)),
        }).json()
        r = admin.post(f"{API}/quotas/pay", json={
            "client_id": c["id"], "year": 2026, "months": [1, 2], "payment_method": "cash"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        # Should produce sale+payment of 10€ and mark cotas paid
        assert "sale" in d or "sale_id" in d or "total" in d, d
        # Verify quotas now paid
        q = admin.get(f"{API}/clients/{c['id']}/quotas?year=2026").json()
        items = q["quotas"]
        paid_months = [it["month"] for it in items if it.get("status") == "paid"]
        assert 1 in paid_months and 2 in paid_months
        admin.delete(f"{API}/clients/{c['id']}")


# ---------- Reports sales filters ----------
class TestReportsSales:
    def test_reports_sales_with_filters(self, admin):
        c, p, sale = _make_client_with_debt(admin, debt=15.0)
        # Filter by user_email
        r = admin.get(f"{API}/reports/sales?user_email=admin@ard.pt")
        assert r.status_code == 200, r.text
        d = r.json()
        # has list and totals
        items = d.get("sales") or d.get("items") or []
        assert any(s.get("id") == sale["id"] for s in items)
        # Filter by client_id
        r2 = admin.get(f"{API}/reports/sales?client_id={c['id']}")
        assert r2.status_code == 200
        items2 = r2.json().get("sales") or r2.json().get("items") or []
        assert all(s.get("client_id") == c["id"] for s in items2)
        # Future date filter excludes
        r3 = admin.get(f"{API}/reports/sales?date_from=2099-01-01&date_to=2099-12-31")
        assert r3.status_code == 200
        items3 = r3.json().get("sales") or r3.json().get("items") or []
        assert len(items3) == 0
        # cleanup
        admin.delete(f"{API}/sales/{sale['id']}")
        admin.delete(f"{API}/products/{p['id']}")
        admin.delete(f"{API}/clients/{c['id']}")


# ---------- Audit log ----------
class TestAuditLog:
    def test_audit_log_admin_access(self, admin):
        r = admin.get(f"{API}/audit-log")
        assert r.status_code == 200, r.text

    def test_audit_log_tesoureiro_access(self, tesoureiro):
        r = tesoureiro.get(f"{API}/audit-log")
        assert r.status_code == 200, r.text

    def test_audit_log_funcionario_forbidden(self, funcionario):
        r = funcionario.get(f"{API}/audit-log")
        assert r.status_code == 403

    def test_sale_edit_audit_has_changes_field(self, admin):
        c, p, sale = _make_client_with_debt(admin, debt=10.0)
        # Edit sale total via items change
        new_total = 20.0
        r = admin.put(f"{API}/sales/{sale['id']}", json={
            "items": [{"product_id": p["id"], "quantity": 2}]
        })
        assert r.status_code == 200, r.text
        time.sleep(0.5)
        # Look for audit entry with changes
        logs = admin.get(f"{API}/audit-log?event_type=sale_edit").json()
        entries = logs if isinstance(logs, list) else (logs.get("items") or [])
        # Find latest for this sale
        found = None
        for it in entries:
            payload = it.get("payload", {}) or {}
            if (it.get("sale_id") == sale["id"] or it.get("entity_id") == sale["id"]
                    or payload.get("sale_id") == sale["id"] or payload.get("id") == sale["id"]):
                found = it
                break
        assert found is not None, f"audit entry for sale_edit not found among {len(entries)} entries"
        changes = found.get("changes") or (found.get("payload") or {}).get("changes")
        assert changes is not None, f"audit entry missing 'changes' field: {found}"
        # Validate structure: should contain at least one of client/total/items with before/after
        keys_with_struct = [k for k, v in changes.items() if isinstance(v, dict) and "before" in v and "after" in v]
        assert keys_with_struct, f"changes has no before/after keys: {changes}"
        # cleanup
        admin.delete(f"{API}/sales/{sale['id']}")
        admin.delete(f"{API}/products/{p['id']}")
        admin.delete(f"{API}/clients/{c['id']}")


# ---------- Points history ----------
class TestPointsHistory:
    def test_client_points_history_admin(self, admin):
        c, p, sale = _make_client_with_debt(admin, debt=50.0, is_member=True)
        r = admin.get(f"{API}/clients/{c['id']}/points-history")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
        assert "earned" in d
        assert "spent" in d
        admin.delete(f"{API}/sales/{sale['id']}")
        admin.delete(f"{API}/products/{p['id']}")
        admin.delete(f"{API}/clients/{c['id']}")


# ---------- Sócio endpoints (rollover, quotas, points-history) ----------
class TestSocioFlow:
    @pytest.fixture(scope="class")
    def socio_session(self, admin):
        # Create sócio with member_number & PIN
        mn = str(93000 + (uuid.uuid4().int % 999))
        pin = "1234"
        c = admin.post(f"{API}/clients", json={
            "name": f"TEST_iter9_socio_{uuid.uuid4().hex[:6]}",
            "is_member": True,
            "member_number": mn,
            "pin": pin,
        }).json()
        # Mark quotas paid (set is_member true is enough? Code may require quota paid)
        # Try to give them points-earning rate by being member.
        sess = requests.Session()
        r = sess.post(f"{API}/socio/login", json={"member_number": mn, "pin": pin}, timeout=15)
        assert r.status_code == 200, r.text
        yield {"session": sess, "client_id": c["id"], "mn": mn}
        admin.delete(f"{API}/clients/{c['id']}")

    def test_socio_quotas_returns_12(self, socio_session):
        r = socio_session["session"].get(f"{API}/socio/quotas")
        assert r.status_code == 200, r.text
        d = r.json()
        items = d["quotas"]
        assert len(items) == 12

    def test_socio_quotas_pay_creates_pending_mbway(self, socio_session, admin):
        r = socio_session["session"].post(f"{API}/socio/quotas/pay", json={
            "year": 2026, "months": [3], "mbway_phone": "910000000"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        mb_id = d.get("id") or d.get("mbway_id") or (d.get("mbway") or {}).get("id")
        assert mb_id is not None, f"missing mbway id in {d}"
        # Admin sees it pending
        pend = admin.get(f"{API}/mbway-payments").json()
        items = pend if isinstance(pend, list) else pend.get("items", [])
        found = [m for m in items if m.get("id") == mb_id]
        assert found, "mbway pending not found"
        assert found[0].get("kind") == "quota"
        assert found[0].get("quota_year") == 2026
        assert 3 in (found[0].get("quota_months") or [])

        # Confirm via admin
        r2 = admin.post(f"{API}/mbway-payments/{mb_id}/confirm")
        assert r2.status_code == 200, r2.text

        # Verify cota now paid for socio
        q = socio_session["session"].get(f"{API}/socio/quotas").json()
        items_q = q["quotas"]
        m3 = [i for i in items_q if i.get("month") == 3]
        assert m3 and m3[0].get("status") == "paid"

    def test_socio_points_history(self, socio_session):
        r = socio_session["session"].get(f"{API}/socio/points-history")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
        assert "earned" in d
        assert "spent" in d

    def test_rollover_points_accumulate_cents(self, admin):
        # member with cotas paid: 1 point per 5€
        # Multiple sales of 0.80€ should accumulate to 5€ = 1 ponto eventually
        mn = str(94000 + (uuid.uuid4().int % 999))
        c = admin.post(f"{API}/clients", json={
            "name": f"TEST_iter9_roll_{uuid.uuid4().hex[:6]}",
            "is_member": True,
            "member_number": mn,
        }).json()
        # Ensure cotas paid (mark via /quotas/pay all year)
        admin.post(f"{API}/quotas/pay", json={
            "client_id": c["id"], "year": 2026, "months": list(range(1, 13)), "payment_method": "cash"
        })
        p = admin.post(f"{API}/products", json={
            "name": f"TEST_iter9_pp_{uuid.uuid4().hex[:6]}",
            "price": 0.80, "quantity": 200, "low_stock_threshold": 1
        }).json()
        last_pending = None
        for _ in range(7):
            sr = admin.post(f"{API}/sales", json={
                "client_id": c["id"],
                "items": [{"product_id": p["id"], "quantity": 1}]
            })
            assert sr.status_code == 200, sr.text
            last_pending = sr.json().get("points_pending_after")
        # After 7×0.80 = 5.60€, should have earned at least 1 ponto
        cli = admin.get(f"{API}/clients/{c['id']}").json()["client"]
        pts = int(cli.get("points", 0))
        assert pts >= 1, f"expected >=1 ponto after 5.60€ acumulado, got {pts}, pending={last_pending}"
        # cleanup
        admin.delete(f"{API}/products/{p['id']}")
        admin.delete(f"{API}/clients/{c['id']}")
