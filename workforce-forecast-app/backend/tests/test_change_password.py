"""
POST /auth/change-password — le changement de mot de passe VOLONTAIRE (hors tout contexte de
changement forcé) n'est plus ouvert qu'à l'ADMIN : seul un Administrateur contrôle désormais
le mot de passe des comptes EUM/EUD et Head of Direction (via /admin/accounts, voir
test_admin_reset_password.py). Le changement FORCÉ (must_change_password=True — première
connexion ou après un reset admin) doit, lui, continuer de fonctionner pour tous les rôles :
c'est ce que ForcePasswordChange.tsx appelle avant même l'accès à l'application.
"""
from app.models import Role

from .conftest import auth_headers, make_user

OLD_PASSWORD = "Test-Password-123!"
NEW_PASSWORD = "Nouveau-Mdp-456!"


def _change(client, user, current=OLD_PASSWORD, new=NEW_PASSWORD):
    return client.post(
        "/auth/change-password",
        headers=auth_headers(user),
        json={"current_password": current, "new_password": new},
    )


def test_admin_can_change_own_password_at_any_time(client, db_session):
    """L'ADMIN garde le changement volontaire — aucun autre mécanisme ne permet de
    réinitialiser son propre compte (routers/accounts.py exclut explicitement les ADMIN)."""
    admin = make_user(db_session, pernr="ADMIN001", nom="Admin", role=Role.ADMIN)
    db_session.commit()
    assert admin.must_change_password is False  # make_user pose un compte déjà actif

    res = _change(client, admin)

    assert res.status_code == 200
    login = client.post("/auth/login", json={"pernr": admin.pernr, "password": NEW_PASSWORD})
    assert login.status_code == 200


def test_eum_eud_cannot_voluntarily_change_password_once_active(client, db_session):
    """Une fois must_change_password déjà à False (compte pleinement actif), un lead EUM/EUD
    ne peut plus initier un changement de sa propre initiative — 403, pas 401 (l'identité et
    le mot de passe fournis ne sont pas en cause, c'est l'action elle-même qui est fermée)."""
    lead = make_user(db_session, pernr="0010001", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()
    assert lead.must_change_password is False

    res = _change(client, lead)

    assert res.status_code == 403


def test_head_of_direction_cannot_voluntarily_change_password_once_active(client, db_session):
    head = make_user(db_session, pernr="HOD0001", nom="Head Test", role=Role.HEAD_OF_DIRECTION, direction_id="D1")
    db_session.commit()
    assert head.must_change_password is False

    res = _change(client, head)

    assert res.status_code == 403


def test_eum_eud_can_still_complete_a_forced_password_change(client, db_session):
    """must_change_password=True (premier login, ou juste après un reset admin) : la route
    reste accessible à ce rôle — c'est le seul cas où un EUM/EUD peut encore l'appeler."""
    lead = make_user(db_session, pernr="0010002", nom="Lead Test", role=Role.EUM_EUD, department_id="DEP1")
    lead.must_change_password = True
    db_session.commit()

    res = _change(client, lead)

    assert res.status_code == 200
    db_session.refresh(lead)
    assert lead.must_change_password is False


def test_head_of_direction_can_still_complete_a_forced_password_change(client, db_session):
    head = make_user(db_session, pernr="HOD0002", nom="Head Test", role=Role.HEAD_OF_DIRECTION, direction_id="D1")
    head.must_change_password = True
    db_session.commit()

    res = _change(client, head)

    assert res.status_code == 200
    db_session.refresh(head)
    assert head.must_change_password is False
