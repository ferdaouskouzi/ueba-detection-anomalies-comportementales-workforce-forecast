"""
Cahier des charges §4.2 : le Head of Direction n'accède qu'à des agrégats — un motif
d'absence nominatif (MAT/SS/EL/CP) ne doit jamais apparaître dans une réponse qui lui est
destinée, à l'écran comme dans toute réponse API. Un EUM/EUD, lui, garde le détail exact
(son périmètre direct). Ces tests couvrent aussi la journalisation des accès en lecture
aux données nominatives, également exigée par §4.2.
"""
from app.models import ActivityCode, Department, Direction, Employee, ForecastEntry, Role, AuditLog

from .conftest import auth_headers, make_user


def _seed_dept_with_entries(db_session):
    """Une direction, un département, un lead et un HOD de cette direction, plus deux
    saisies réelles : une Production (avec projet) et une Absence nominative (EL)."""
    db_session.add(Direction(id="D1", nom="Ingénierie Automobile"))
    db_session.flush()
    db_session.add(Department(id="DEP1", nom="Powertrain Systems", direction_id="D1",
                               lead_pernr="0010001", lead_titre="EUM"))
    db_session.add(Employee(pernr="0010001", nom="Léa Cherkaoui", manager_pernr=None,
                             statut="Active", direction_id="D1", department_id="DEP1"))
    db_session.add_all([
        ActivityCode(code="P", libelle="Production", famille="Production", projet_obligatoire=True, couleur="#0070AD"),
        ActivityCode(code="EL", libelle="Exceptional Leave", famille="Absence", projet_obligatoire=False, couleur="#D9534F"),
    ])
    db_session.flush()

    db_session.add(ForecastEntry(pernr="0010001", date="2026-08-17", demi_journee="AM",
                                  code="P", project_code="PRJ-001", auteur="Lead Powertrain Systems"))
    db_session.add(ForecastEntry(pernr="0010001", date="2026-08-18", demi_journee="AM",
                                  code="EL", project_code=None, auteur="Lead Powertrain Systems"))

    lead = make_user(db_session, pernr="LEAD1", nom="Lead Powertrain Systems", role=Role.EUM_EUD,
                      direction_id="D1", department_id="DEP1")
    hod = make_user(db_session, pernr="HODTEST", nom="Head Test", role=Role.HEAD_OF_DIRECTION, direction_id="D1")
    db_session.commit()
    return lead, hod


def test_hod_receives_aggregated_absence_never_the_nominative_code(client, db_session):
    _lead, hod = _seed_dept_with_entries(db_session)

    res = client.get("/forecast-entries", headers=auth_headers(hod))
    assert res.status_code == 200
    codes = {e["code"] for e in res.json()}

    assert "EL" not in codes, "le motif nominatif EL ne doit jamais apparaître pour un HOD"
    assert "Absence" in codes, "il doit être remplacé par le libellé générique de la famille"
    assert "P" in codes, "un code sans caractère personnel (Production) reste inchangé"


def test_eum_eud_still_receives_the_exact_code_no_regression(client, db_session):
    lead, _hod = _seed_dept_with_entries(db_session)

    res = client.get("/forecast-entries", headers=auth_headers(lead))
    assert res.status_code == 200
    codes = {e["code"] for e in res.json()}

    assert "EL" in codes, "un EUM/EUD garde le détail exact de son propre périmètre"
    assert "Absence" not in codes


def test_forecast_read_is_audited(client, db_session):
    _lead, hod = _seed_dept_with_entries(db_session)

    before = db_session.query(AuditLog).filter(AuditLog.action == "FORECAST_READ").count()
    res = client.get("/forecast-entries", headers=auth_headers(hod))
    assert res.status_code == 200
    after = db_session.query(AuditLog).filter(AuditLog.action == "FORECAST_READ").count()

    assert after == before + 1
    entry = db_session.query(AuditLog).filter(AuditLog.action == "FORECAST_READ").order_by(AuditLog.id.desc()).first()
    assert entry.qui == hod.pernr
    assert "direction:D1" in entry.detail


def test_employees_read_is_audited(client, db_session):
    _lead, hod = _seed_dept_with_entries(db_session)

    before = db_session.query(AuditLog).filter(AuditLog.action == "EMPLOYEES_READ").count()
    res = client.get("/employees", headers=auth_headers(hod))
    assert res.status_code == 200
    after = db_session.query(AuditLog).filter(AuditLog.action == "EMPLOYEES_READ").count()

    assert after == before + 1
    entry = db_session.query(AuditLog).filter(AuditLog.action == "EMPLOYEES_READ").order_by(AuditLog.id.desc()).first()
    assert entry.qui == hod.pernr


def test_admin_global_has_no_access_to_forecast_entries(client, db_session):
    """CDC §2.2 : l'Administrateur Global pilote référentiels / imports / comptes /
    journal d'audit — jamais les saisies de forecast. Défense en profondeur, en plus
    du retrait de l'onglet Tableau de bord côté client : l'endpoint lui-même refuse."""
    _lead, _hod = _seed_dept_with_entries(db_session)
    admin = make_user(db_session, pernr="ADMGLOB", nom="Admin Global", role=Role.ADMIN)
    db_session.commit()

    res = client.get("/forecast-entries", headers=auth_headers(admin))
    assert res.status_code == 403
    # 403 levé dans la dépendance de rôle, avant le handler : aucune lecture n'est journalisée.
    assert db_session.query(AuditLog).filter(
        AuditLog.action == "FORECAST_READ", AuditLog.qui == "ADMGLOB",
    ).count() == 0
