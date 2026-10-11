"""
Flux login + TOTP complet (les autres tests bypassent volontairement ce flux via
create_access_token — voir conftest.make_user). Couvre spécifiquement la défense en
profondeur côté serveur : expected_role doit être revérifié contre le rôle réel du
compte après authentification complète, avant toute émission de token.
"""
import pyotp

from app.models import AuditLog, Role

from .conftest import make_user

PASSWORD = "Test-Password-123!"


def _login_and_verify(client, user, expected_role):
    step1 = client.post("/auth/login", json={"pernr": user.pernr, "password": PASSWORD})
    assert step1.status_code == 200
    temp_token = step1.json()["temp_token"]
    code = pyotp.TOTP(user.totp_secret).now()
    return client.post("/auth/verify-totp", json={
        "temp_token": temp_token, "code": code, "expected_role": expected_role,
    })


def test_login_succeeds_when_expected_role_matches(client, db_session):
    user = make_user(db_session, pernr="0010001", nom="Test Lead", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    res = _login_and_verify(client, user, expected_role="EUM_EUD")

    assert res.status_code == 200
    body = res.json()
    assert body["access_token"]
    assert body["user"]["role"] == "EUM_EUD"


def test_login_rejected_when_expected_role_mismatches(client, db_session):
    """Identifiants + TOTP valides, mais expected_role ne correspond pas au rôle réel du
    compte (ex. frontend contourné/modifié, ou mauvaise tuile sélectionnée) : rejet 403
    explicite, jamais de token émis — le serveur est la source de vérité finale, pas
    seulement le contrôle client."""
    user = make_user(db_session, pernr="0010001", nom="Test Lead", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    res = _login_and_verify(client, user, expected_role="ADMIN")

    assert res.status_code == 403
    assert res.json()["detail"] == "role_mismatch"
    assert "access_token" not in res.json()


# --------------------------------------------------------------------------
# Traçabilité (CDC §3.2 / §4.3) : toute tentative de connexion laisse une ligne
# dans audit_log — le code le fait (auth.py::_audit), rien ne le vérifiait.
# --------------------------------------------------------------------------
def _audit_rows(db_session, action):
    return (
        db_session.query(AuditLog)
        .filter(AuditLog.action == action)
        .order_by(AuditLog.id.desc())
        .all()
    )


def test_successful_login_writes_a_login_success_row(client, db_session):
    user = make_user(db_session, pernr="0010007", nom="Test Lead", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    assert _audit_rows(db_session, "LOGIN_SUCCESS") == []

    res = _login_and_verify(client, user, expected_role="EUM_EUD")
    assert res.status_code == 200

    rows = _audit_rows(db_session, "LOGIN_SUCCESS")
    assert len(rows) == 1
    assert rows[0].qui == user.pernr
    # événement d'authentification : pas de dimension nominative (colonnes UEBA NULL)
    assert rows[0].target_pernrs is None and rows[0].perimetre is None


def test_failed_login_writes_a_login_fail_row(client, db_session):
    """Mauvais mot de passe -> 401 générique ET une ligne LOGIN_FAIL horodatée
    (l'action s'appelle LOGIN_FAIL dans le code, pas LOGIN_FAILURE)."""
    user = make_user(db_session, pernr="0010008", nom="Test Lead", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    res = client.post("/auth/login", json={"pernr": user.pernr, "password": "mauvais-mot-de-passe"})
    assert res.status_code == 401

    rows = _audit_rows(db_session, "LOGIN_FAIL")
    assert len(rows) == 1
    assert rows[0].qui == user.pernr
    assert "Mot de passe incorrect" in (rows[0].detail or "")
    # le compteur d'échecs a bien été incrémenté au passage
    db_session.refresh(user)
    assert user.failed_attempts == 1


def test_failed_login_on_unknown_pernr_is_also_audited(client, db_session):
    res = client.post("/auth/login", json={"pernr": "0000000", "password": "peu importe"})
    assert res.status_code == 401

    rows = _audit_rows(db_session, "LOGIN_FAIL")
    assert len(rows) == 1
    assert rows[0].qui == "0000000"
    assert "PERNR inconnu" in (rows[0].detail or "")
