"""
Audit : le champ `code` d'une saisie de forecast n'était validé nulle part contre le
référentiel ActivityCode avant persistance — ni par le schéma Pydantic (ForecastPaintRequest.
code: str, sans validateur), ni par une contrainte SQL (ForecastEntry.code n'a pas de
ForeignKey), ni en logique applicative dans paint_forecast_entries(). Un code inconnu du
référentiel (différent du littéral technique "__erase") pouvait donc s'enregistrer tel quel.
Ce test couvre le rejet ajouté dans routers/forecast.py, sans casser les deux chemins déjà
valides ("__erase" et un code réel du référentiel).
"""
from app.models import ActivityCode, Department, Direction, Employee, ForecastEntry, Project, Role

from .conftest import auth_headers, make_user


def _seed_ready_department(db_session):
    """Une direction, un département prêt (au moins un collaborateur + un projet actif) —
    le minimum pour que POST /forecast-entries/paint dépasse department_is_ready() et
    atteigne la validation du code d'activité."""
    db_session.add(Direction(id="D1", nom="Ingénierie Automobile"))
    db_session.flush()
    db_session.add(Department(id="DEP1", nom="Powertrain Systems", direction_id="D1",
                               lead_pernr="0010001", lead_titre="EUM"))
    db_session.add(Employee(pernr="0010001", nom="Léa Cherkaoui", manager_pernr=None,
                             statut="Active", direction_id="D1", department_id="DEP1"))
    db_session.add(Project(code="PRJ-001", nom="Projet A", client="ClientA", statut="actif"))
    db_session.add(ActivityCode(code="P", libelle="Production", famille="Production",
                                 projet_obligatoire=True, couleur="#0070AD"))
    db_session.flush()
    lead = make_user(db_session, pernr="LEAD1", nom="Lead Powertrain Systems", role=Role.EUM_EUD,
                      direction_id="D1", department_id="DEP1")
    db_session.commit()
    return lead


def test_paint_code_validation(client, db_session):
    lead = _seed_ready_department(db_session)

    # Code inconnu du référentiel, sans rapport avec le littéral "__erase" : rejeté, rien
    # n'est écrit en base.
    res = client.post(
        "/forecast-entries/paint",
        headers=auth_headers(lead),
        json={
            "updates": [{"pernr": "0010001", "date": "2026-08-17", "demi": "AM"}],
            "code": "ZZZ_INCONNU",
            "project_code": None,
        },
    )
    assert res.status_code == 400
    assert "ZZZ_INCONNU" in res.json()["detail"]
    assert db_session.query(ForecastEntry).count() == 0

    # Un code réel du référentiel reste accepté comme avant.
    res = client.post(
        "/forecast-entries/paint",
        headers=auth_headers(lead),
        json={
            "updates": [{"pernr": "0010001", "date": "2026-08-17", "demi": "AM"}],
            "code": "P",
            "project_code": "PRJ-001",
        },
    )
    assert res.status_code == 200
    assert db_session.query(ForecastEntry).count() == 1

    # "__erase" reste accepté comme avant (efface l'entrée qui vient d'être créée).
    res = client.post(
        "/forecast-entries/paint",
        headers=auth_headers(lead),
        json={
            "updates": [{"pernr": "0010001", "date": "2026-08-17", "demi": "AM"}],
            "code": "__erase",
            "project_code": None,
        },
    )
    assert res.status_code == 200
    assert db_session.query(ForecastEntry).count() == 0
