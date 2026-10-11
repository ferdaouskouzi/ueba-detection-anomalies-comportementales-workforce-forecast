"""
CDC §3.3 : l'endpoint réel d'import doit renvoyer un rapport ligne à ligne
(acceptée / rejetée + motif) ET écrire en base les lignes acceptées.

test_import.py couvre déjà les fonctions pures de validation ; ici on passe par
POST /admin/import/{employees,projects} avec un vrai .xlsx multipart, pour
vérifier le contrat de l'endpoint (schéma ImportReport) et la persistance.
"""
from app.models import Employee, Project, Role

from .conftest import XLSX_CONTENT_TYPE, auth_headers, make_user, make_xlsx


def _admin_headers(db_session):
    admin = make_user(db_session, pernr="ADMIMP", nom="Admin Import", role=Role.ADMIN)
    db_session.commit()
    return auth_headers(admin)


def _motifs(rapport, statut):
    return {r.get("motif") for r in rapport if r["statut"] == statut}


def test_import_employees_endpoint_reports_and_persists(client, db_session):
    headers = _admin_headers(db_session)

    people_xlsx = make_xlsx({
        "people": [
            {"pernr": "0020001", "name": "Alice Nardo", "people manager": None, "status": "Active"},
            {"pernr": None, "name": "Bob SansPernr", "people manager": None, "status": "Active"},
            {"pernr": "0020001", "name": "Alice Doublon", "people manager": None, "status": "Active"},
            {"pernr": "0020004", "name": "Dan Statut", "people manager": None, "status": "Zombie"},
        ],
        "mapping": [
            {"name": "Alice Nardo", "department": "Assurance Qualité", "direction": "Direction Qualité", "role": "EUM"},
            {"name": "Fantôme Inconnu", "department": "X", "direction": "Y", "role": "EUM"},
        ],
    })

    r = client.post(
        "/admin/import/employees", headers=headers,
        files={"file": ("people.xlsx", people_xlsx, XLSX_CONTENT_TYPE)},
    )
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["kind"] == "employees"
    # acceptées : Alice (people) + Alice (mapping) ; rejetées : pernr manquant,
    # doublon, statut inconnu, mapping introuvable.
    assert body["acceptees"] == 2
    assert body["rejetees"] == 4
    assert body["total_lignes"] == 6

    rapport = body["rapport"]
    assert len(rapport) == 6
    assert _motifs(rapport, "rejeté") == {
        "PERNR manquant",
        "PERNR en doublon",
        "Statut inconnu",
        "Collaborateur introuvable",
    }
    # chaque ligne du rapport porte feuille + ligne + statut
    for row in rapport:
        assert row["feuille"] in {"people", "mapping"}
        assert isinstance(row["ligne"], int)
        assert row["statut"] in {"accepté", "rejeté"}
    accepte_people = [r for r in rapport if r["statut"] == "accepté" and r["feuille"] == "people"]
    assert len(accepte_people) == 1

    # persistance : seule la ligne acceptée est écrite, avec le nom de la 1re occurrence
    employees = db_session.query(Employee).all()
    assert {e.pernr for e in employees} == {"0020001"}
    assert db_session.query(Employee).filter(Employee.pernr == "0020001").one().nom == "Alice Nardo"


def test_import_projects_endpoint_reports_and_persists(client, db_session):
    headers = _admin_headers(db_session)

    projects_xlsx = make_xlsx({
        "projects": [
            {"code": "PRJ-X1", "name": "Projet X1", "client": "Client A", "status": "active"},
            {"code": "PRJ-X1", "name": "Projet X1 bis", "client": "Client A", "status": "active"},
            {"code": "PRJ-X2", "name": "Projet X2", "client": "Client B", "status": "en pause"},
            {"code": "", "name": "Projet sans code", "client": "Client C", "status": "active"},
        ],
    })

    r = client.post(
        "/admin/import/projects", headers=headers,
        files={"file": ("projects.xlsx", projects_xlsx, XLSX_CONTENT_TYPE)},
    )
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["kind"] == "projects"
    assert body["acceptees"] == 1
    assert body["rejetees"] == 3
    assert _motifs(body["rapport"], "rejeté") == {
        "Code projet en doublon",
        "Statut projet inconnu",
        "Code projet manquant",
    }

    # persistance : PRJ-X1 seul, avec statut normalisé
    projects = db_session.query(Project).all()
    assert {p.code for p in projects} == {"PRJ-X1"}
    assert db_session.query(Project).filter(Project.code == "PRJ-X1").one().statut == "actif"


def test_import_employees_endpoint_requires_admin(client, db_session):
    lead = make_user(db_session, pernr="LEADIMP", nom="Lead", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()
    xlsx = make_xlsx({"people": [{"pernr": "1", "name": "A", "people manager": None, "status": "Active"}],
                      "mapping": []})
    r = client.post(
        "/admin/import/employees", headers=auth_headers(lead),
        files={"file": ("people.xlsx", xlsx, XLSX_CONTENT_TYPE)},
    )
    assert r.status_code == 403
