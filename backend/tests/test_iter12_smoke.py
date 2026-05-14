"""Smoke test confirming create_product persists is_food/unavailable/is_house_account."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin@ard.pt", "admin123")


def test_create_product_persists_three_flags(admin):
    body = {
        "name": "TEST_iter12_flags",
        "price": 2.5,
        "quantity": 10,
        "low_stock_threshold": 2,
        "category": "Comida",
        "is_food": True,
        "unavailable": True,
        "is_house_account": True,
    }
    r = admin.post(f"{API}/products", json=body)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["is_food"] is True
    assert p["unavailable"] is True
    assert p["is_house_account"] is True
    pid = p["id"]

    # Verify persistence via GET
    r2 = admin.get(f"{API}/products")
    assert r2.status_code == 200
    found = next((x for x in r2.json() if x["id"] == pid), None)
    assert found is not None
    assert found.get("is_food") is True
    assert found.get("unavailable") is True
    assert found.get("is_house_account") is True

    # cleanup
    admin.delete(f"{API}/products/{pid}")
