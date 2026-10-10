"""
Cahier des charges §2.3/§3.3 : l'Administrateur importe les référentiels (collaborateurs,
projets) AVANT qu'un EUM/EUD puisse saisir du forecast pour son équipe. Ces tests vérifient
que cet ordre est réellement imposé côté serveur — pas seulement caché côté interface — dans
le scénario exact demandé : lead bloqué -> admin importe -> même lead débloqué, et qu'un
département resté sans import reste bloqué même après l'import d'un AUTRE département.
"""
from app.models import ActivityCode, Department, Direction, Role

from .conftest import XLSX_CONTENT_TYPE, auth_headers, make_user, make_xlsx


def _seed_direction_and_department(db_session, *, dir_id, dir_nom, dep_id, dep_nom, lead_pernr):
    """Simule ce qu'un admin ferait en amont : provisionner le département (et donc le compte
    EUM/EUD qui pointe dessus) avant même que le référentiel collaborateurs/projets existe —
    c'est précisément l'état « pas encore configuré » que ce module doit couvrir."""
    direction = Direction(id=dir_id, nom=dir_nom)
    db_session.add(direction)
    db_session.flush()
    dept = Department(id=dep_id, nom=dep_nom, direction_id=dir_id, lead_pernr=lead_pernr, lead_titre="EUM")
    db_session.add(dept)
    db_session.flush()
    return direction, dept


def _paint_payload(pernr: str, code: str = "P", project_code: str | None = "PRJQ1") -> dict:
    return {
        "updates": [{"pernr": pernr, "date": "2026-01-05", "demi": "AM"}],
        "code": code,
        "project_code": project_code,
    }


def test_lead_blocked_then_unblocked_after_admin_imports_for_their_department(client, db_session):
    _seed_direction_and_department(
        db_session, dir_id="DIRQ", dir_nom="Direction Qualité",
        dep_id="DEPQ", dep_nom="Assurance Qualité", lead_pernr="LEADQ1",
    )
    lead = make_user(db_session, pernr="LEADQ1", nom="Lead Qualité", role=Role.EUM_EUD,
                      direction_id="DIRQ", department_id="DEPQ")
    admin = make_user(db_session, pernr="ADMINQ", nom="Admin Test", role=Role.ADMIN)
    # Le référentiel des codes d'activité est seedé au démarrage en production (app/seed.py) —
    # jamais absent en pratique. Seedé ici explicitement pour que le paint final passe la
    # validation ajoutée dans paint_forecast_entries() (code doit exister dans ActivityCode).
    db_session.add(ActivityCode(code="P", libelle="Production", famille="Production",
                                 projet_obligatoire=True, couleur="#0070AD"))
    db_session.commit()

    lead_headers = auth_headers(lead)
    admin_headers = auth_headers(admin)

    # 1) Le lead se connecte avant tout import : /auth/me doit déjà annoncer "pas prêt", et la
    #    grille (qui s'appuierait sur ce champ) n'afficherait pas une grille vide/cassée.
    me = client.get("/auth/me", headers=lead_headers)
    assert me.status_code == 200
    assert me.json()["department_ready"] is False

    # ... et une tentative de saisie est refusée par le SERVEUR, pas seulement cachée à l'écran.
    blocked = client.post("/forecast-entries/paint", headers=lead_headers, json=_paint_payload("LEADQ1"))
    assert blocked.status_code == 409

    # 2) Un compte admin importe collaborateurs puis projets pour ce département.
    people_xlsx = make_xlsx({
        "people": [{"pernr": "LEADQ1", "name": "Lead Qualité", "people manager": None, "status": "Active"}],
        "mapping": [{"name": "Lead Qualité", "department": "Assurance Qualité",
                     "direction": "Direction Qualité", "role": "EUM"}],
    })
    r1 = client.post(
        "/admin/import/employees", headers=admin_headers,
        files={"file": ("people.xlsx", people_xlsx, XLSX_CONTENT_TYPE)},
    )
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    assert body1["acceptees"] == 2  # 1 ligne people + 1 ligne mapping
    by_dept = {d["department_id"]: d for d in body1["par_departement"]}
    assert by_dept["DEPQ"]["collaborateurs"] == 1
    assert by_dept["DEPQ"]["pret"] is False  # collaborateurs importés, mais aucun projet actif encore

    projects_xlsx = make_xlsx({
        "projects": [{"code": "PRJQ1", "name": "Projet Qualité", "client": "Client X", "status": "active"}],
    })
    r2 = client.post(
        "/admin/import/projects", headers=admin_headers,
        files={"file": ("projects.xlsx", projects_xlsx, XLSX_CONTENT_TYPE)},
    )
    assert r2.status_code == 200, r2.text
    by_dept2 = {d["department_id"]: d for d in r2.json()["par_departement"]}
    assert by_dept2["DEPQ"]["pret"] is True

    # 3) Le MÊME lead se reconnecte (ou rafraîchit) : département prêt, grille correctement
    #    peuplée avec les bons collaborateurs, et la saisie est désormais acceptée.
    me2 = client.get("/auth/me", headers=lead_headers)
    assert me2.json()["department_ready"] is True

    employees = client.get("/employees", headers=lead_headers)
    assert employees.status_code == 200
    assert {e["pernr"] for e in employees.json()} == {"LEADQ1"}

    ok = client.post("/forecast-entries/paint", headers=lead_headers, json=_paint_payload("LEADQ1"))
    assert ok.status_code == 200, ok.text
    assert len(ok.json()["updated"]) == 1


def test_other_department_stays_blocked_after_unrelated_department_import(client, db_session):
    _seed_direction_and_department(
        db_session, dir_id="DIRQ", dir_nom="Direction Qualité",
        dep_id="DEPQ", dep_nom="Assurance Qualité", lead_pernr="LEADQ1",
    )
    _seed_direction_and_department(
        db_session, dir_id="DIRR", dir_nom="Direction RH",
        dep_id="DEPR", dep_nom="Ressources Humaines", lead_pernr="LEADR1",
    )
    make_user(db_session, pernr="LEADQ1", nom="Lead Qualité", role=Role.EUM_EUD,
              direction_id="DIRQ", department_id="DEPQ")
    lead_r = make_user(db_session, pernr="LEADR1", nom="Lead RH", role=Role.EUM_EUD,
                        direction_id="DIRR", department_id="DEPR")
    admin = make_user(db_session, pernr="ADMINQ", nom="Admin Test", role=Role.ADMIN)
    db_session.commit()

    admin_headers = auth_headers(admin)
    lead_r_headers = auth_headers(lead_r)

    # Import complet, mais uniquement pour le département Qualité — jamais pour RH.
    people_xlsx = make_xlsx({
        "people": [{"pernr": "LEADQ1", "name": "Lead Qualité", "people manager": None, "status": "Active"}],
        "mapping": [{"name": "Lead Qualité", "department": "Assurance Qualité",
                     "direction": "Direction Qualité", "role": "EUM"}],
    })
    client.post("/admin/import/employees", headers=admin_headers,
                files={"file": ("people.xlsx", people_xlsx, XLSX_CONTENT_TYPE)})
    projects_xlsx = make_xlsx({
        "projects": [{"code": "PRJQ1", "name": "Projet Qualité", "client": "Client X", "status": "active"}],
    })
    client.post("/admin/import/projects", headers=admin_headers,
                files={"file": ("projects.xlsx", projects_xlsx, XLSX_CONTENT_TYPE)})

    # Le lead RH — jamais importé — doit rester bloqué, même si un projet actif existe
    # désormais globalement (le déblocage n'est pas un interrupteur global).
    me = client.get("/auth/me", headers=lead_r_headers)
    assert me.status_code == 200
    assert me.json()["department_ready"] is False

    blocked = client.post("/forecast-entries/paint", headers=lead_r_headers, json=_paint_payload("LEADR1"))
    assert blocked.status_code == 409
