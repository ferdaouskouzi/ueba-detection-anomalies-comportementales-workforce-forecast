"""
Réinitialisation de mot de passe par l'Administrateur (cahier des charges §2.2) —
POST /admin/accounts/{pernr}/reset-password. Couvre : accès strictement ADMIN, l'ancien
mot de passe cesse de fonctionner immédiatement, le nouveau force un changement au
prochain login, et l'action est journalisée (qui, cible, quand) — jamais le mot de passe
en clair dans audit_log.
"""
import datetime as dt

from app.models import AuditLog, Role
from app.security import password_policy_errors, verify_password

from .conftest import auth_headers, make_user

OLD_PASSWORD = "Test-Password-123!"  # mot de passe posé par make_user (voir conftest.py)


def _audit_rows(db_session, action):
    return (
        db_session.query(AuditLog)
        .filter(AuditLog.action == action)
        .order_by(AuditLog.id.desc())
        .all()
    )


def test_admin_reset_returns_a_policy_compliant_temporary_password(client, db_session):
    admin = make_user(db_session, pernr="ADMIN001", nom="Admin", role=Role.ADMIN)
    target = make_user(db_session, pernr="0010001", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    res = client.post(f"/admin/accounts/{target.pernr}/reset-password", headers=auth_headers(admin))

    assert res.status_code == 200
    temp_password = res.json()["temporary_password"]
    assert temp_password and temp_password != OLD_PASSWORD
    assert password_policy_errors(temp_password) == []


def test_temporary_password_is_never_stored_in_plaintext(client, db_session):
    """Le mot de passe temporaire renvoyé une seule fois par l'API n'existe en base que sous
    forme de hash Argon2id — jamais en clair, jamais en sous-chaîne du hash, et le hash
    vérifie bien CE mot de passe précis (pas juste "un hash différent de l'ancien")."""
    admin = make_user(db_session, pernr="ADMIN011", nom="Admin", role=Role.ADMIN)
    target = make_user(db_session, pernr="0010011", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    res = client.post(f"/admin/accounts/{target.pernr}/reset-password", headers=auth_headers(admin))
    temp_password = res.json()["temporary_password"]

    db_session.refresh(target)
    assert target.password_hash != temp_password
    assert temp_password not in target.password_hash
    assert target.password_hash.startswith("$argon2id$")
    assert verify_password(temp_password, target.password_hash)


def test_non_admin_cannot_reset_a_password(client, db_session):
    """EUM/EUD comme Head of Direction n'ont pas accès à cette route — 403, même si le compte
    ciblé est valide (cahier des charges §2.2/§4.1 : accès strictement ADMIN)."""
    lead = make_user(db_session, pernr="0010002", nom="Lead A", role=Role.EUM_EUD, department_id="DEP1")
    target = make_user(db_session, pernr="0010003", nom="Lead B", role=Role.EUM_EUD, department_id="DEP2")
    db_session.commit()

    res = client.post(f"/admin/accounts/{target.pernr}/reset-password", headers=auth_headers(lead))

    assert res.status_code == 403


def test_old_password_no_longer_works_after_reset(client, db_session):
    admin = make_user(db_session, pernr="ADMIN002", nom="Admin", role=Role.ADMIN)
    target = make_user(db_session, pernr="0010004", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    res = client.post(f"/admin/accounts/{target.pernr}/reset-password", headers=auth_headers(admin))
    assert res.status_code == 200

    login = client.post("/auth/login", json={"pernr": target.pernr, "password": OLD_PASSWORD})
    assert login.status_code == 401


def test_temporary_password_logs_in_and_forces_a_password_change(client, db_session):
    """Le nouveau mot de passe temporaire fonctionne immédiatement (étape 1 du login), et le
    compte porte must_change_password=True — le prochain login imposera son changement."""
    admin = make_user(db_session, pernr="ADMIN003", nom="Admin", role=Role.ADMIN)
    target = make_user(db_session, pernr="0010005", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    res = client.post(f"/admin/accounts/{target.pernr}/reset-password", headers=auth_headers(admin))
    temp_password = res.json()["temporary_password"]

    login = client.post("/auth/login", json={"pernr": target.pernr, "password": temp_password})
    assert login.status_code == 200

    db_session.refresh(target)
    assert target.must_change_password is True


def test_reset_unlocks_a_locked_account(client, db_session):
    """Un admin qui réinitialise un compte verrouillé le débloque aussi — sinon le nouveau
    mot de passe temporaire resterait inutilisable jusqu'à expiration du verrou."""
    admin = make_user(db_session, pernr="ADMIN004", nom="Admin", role=Role.ADMIN)
    target = make_user(db_session, pernr="0010006", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    target.failed_attempts = 5
    target.locked_until = dt.datetime.utcnow() + dt.timedelta(minutes=30)
    db_session.commit()

    res = client.post(f"/admin/accounts/{target.pernr}/reset-password", headers=auth_headers(admin))
    temp_password = res.json()["temporary_password"]

    db_session.refresh(target)
    assert target.locked_until is None
    assert target.failed_attempts == 0

    login = client.post("/auth/login", json={"pernr": target.pernr, "password": temp_password})
    assert login.status_code == 200


def test_reset_is_audited_with_who_and_target(client, db_session):
    admin = make_user(db_session, pernr="ADMIN005", nom="Admin", role=Role.ADMIN)
    target = make_user(db_session, pernr="0010007", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    assert _audit_rows(db_session, "PASSWORD_RESET_BY_ADMIN") == []

    res = client.post(f"/admin/accounts/{target.pernr}/reset-password", headers=auth_headers(admin))
    assert res.status_code == 200
    temp_password = res.json()["temporary_password"]

    rows = _audit_rows(db_session, "PASSWORD_RESET_BY_ADMIN")
    assert len(rows) == 1
    assert rows[0].qui == admin.pernr
    assert target.pernr in (rows[0].detail or "")
    # jamais le mot de passe en clair dans le journal
    assert temp_password not in (rows[0].detail or "")
    assert rows[0].target_pernrs is not None and target.pernr in rows[0].target_pernrs


def test_cannot_reset_an_admin_account_through_this_endpoint(client, db_session):
    """Périmètre strict (cahier des charges §2.2) : seuls EUM/EUD et Head of Direction sont
    gérés ici — un autre compte ADMIN n'est pas une cible valide, 404 comme un compte
    inexistant (pas de fuite d'information sur les identifiants ADMIN)."""
    admin = make_user(db_session, pernr="ADMIN006", nom="Admin", role=Role.ADMIN)
    other_admin = make_user(db_session, pernr="ADMIN007", nom="Autre admin", role=Role.ADMIN)
    db_session.commit()

    res = client.post(f"/admin/accounts/{other_admin.pernr}/reset-password", headers=auth_headers(admin))

    assert res.status_code == 404


def test_reset_unknown_pernr_returns_404(client, db_session):
    admin = make_user(db_session, pernr="ADMIN008", nom="Admin", role=Role.ADMIN)
    db_session.commit()

    res = client.post("/admin/accounts/0000000/reset-password", headers=auth_headers(admin))

    assert res.status_code == 404


def test_list_accounts_excludes_admin_accounts(client, db_session):
    admin = make_user(db_session, pernr="ADMIN009", nom="Admin", role=Role.ADMIN)
    lead = make_user(db_session, pernr="0010008", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    head = make_user(db_session, pernr="HOD0001", nom="Head Test", role=Role.HEAD_OF_DIRECTION, direction_id="D1")
    db_session.commit()

    res = client.get("/admin/accounts", headers=auth_headers(admin))

    assert res.status_code == 200
    pernrs = {row["pernr"] for row in res.json()}
    assert pernrs == {lead.pernr, head.pernr}
    assert admin.pernr not in pernrs


def test_list_accounts_requires_admin(client, db_session):
    lead = make_user(db_session, pernr="0010009", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    res = client.get("/admin/accounts", headers=auth_headers(lead))

    assert res.status_code == 403
