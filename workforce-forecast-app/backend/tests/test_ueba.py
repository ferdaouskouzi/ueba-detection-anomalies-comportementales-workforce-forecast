"""
Tests du module UEBA (backend/ueba/) — adaptés de tests/test_api.py du dépôt
source (UEBA-Detection-Anomalies-RH), plus les garde-fous propres à l'intégration
ici : RBAC ADMIN sur /ueba/*, et découplage du scoring en tâche de fond.

La baseline par lead n'est plus un CSV : elle est reconstruite depuis audit_log.
Chaque test qui score un lead lui fabrique donc d'abord un historique d'accès
'normal' via _seed_historique_lecture.
"""
import datetime as dt
import json
import logging

import pytest

from app.models import AuditLog, Department, Direction, Employee, Role, UebaScore

from .conftest import auth_headers, make_user

UNIVERS = [f"70{i:05d}" for i in range(60)]  # 60 collaborateurs 'habituels' du lead


def _seed_historique_lecture(db_session, pernr_lead, *, jours=12, base_date=dt.date(2026, 8, 10)):
    """`jours` journées d'accès nominatifs réguliers pour ce lead dans audit_log :
    volume ~40/j (avec un peu de variance), première connexion ~8h, amplitude
    horaire ~45 min, nouveauté faible et stable — de quoi asseoir une baseline."""
    for d in range(jours):
        jour = base_date + dt.timedelta(days=d)
        n = 36 + (d % 9)                       # 36..44 fiches ce jour-là
        debut = (d * 7) % 20
        pernrs_jour = UNIVERS[debut:debut + n]  # recouvre largement la veille
        k = len(pernrs_jour)
        tranches = [pernrs_jour[:k // 3], pernrs_jour[k // 3:2 * k // 3], pernrs_jour[2 * k // 3:]]
        base_dt = dt.datetime.combine(jour, dt.time(8, 0)) + dt.timedelta(minutes=d % 5)
        offsets = [0, 15 + (d % 4) * 3, 38 + (d % 6) * 4]  # min ; amplitude 38..58 min
        for tr, off in zip(tranches, offsets):
            db_session.add(AuditLog(
                qui=pernr_lead, action="EMPLOYEES_READ",
                detail=f"role=EUM_EUD perimetre=department:DEP1 lignes={len(tr)}",
                ip="127.0.0.1",
                quand=base_dt + dt.timedelta(minutes=off),
                target_pernrs=json.dumps(tr),
                perimetre=False,
            ))
    db_session.commit()


@pytest.fixture()
def admin(db_session):
    u = make_user(db_session, pernr="ADM1", nom="Admin UEBA", role=Role.ADMIN)
    db_session.commit()
    return u


@pytest.fixture()
def tache_fond_sur_test_db(db_session, monkeypatch):
    """Fait tourner la tâche de fond de scoring sur la base de test isolée
    (par défaut elle ouvrirait une session sur la vraie workforce.db)."""
    class _SansFermeture:
        def __getattr__(self, k):
            return getattr(db_session, k)

        def close(self):  # la session de test survit à la tâche
            pass

    monkeypatch.setattr("ueba.tasks._nouvelle_session", lambda: _SansFermeture())


# --------------------------------------------------------------------------
# POST /ueba/score — repris de test_api.py source
# --------------------------------------------------------------------------
def test_score_action_normale(client, db_session, admin):
    _seed_historique_lecture(db_session, "5000002")
    payload = {
        "pernr_lead": "5000002",
        "heure_connexion": 8.0,
        "nb_fiches_consultees": 40,
        "hors_departement": False,
        "duree_minutes": 45,
        "pernrs_consultes": UNIVERS[:30] + ["99900", "99901", "99902"],
    }
    r = client.post("/ueba/score", json=payload, headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json()["est_suspect"] is False


def test_score_action_suspecte(client, db_session, admin):
    _seed_historique_lecture(db_session, "5000002")
    payload = {
        "pernr_lead": "5000002",
        "heure_connexion": 2.5,
        "nb_fiches_consultees": 250,
        "hors_departement": True,
        "duree_minutes": 5,
    }
    r = client.post("/ueba/score", json=payload, headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json()["est_suspect"] is True


def test_score_lead_inconnu(client, db_session, admin):
    payload = {
        "pernr_lead": "0000000",
        "heure_connexion": 9.4,
        "nb_fiches_consultees": 40,
        "hors_departement": False,
        "duree_minutes": 60,
    }
    r = client.post("/ueba/score", json=payload, headers=auth_headers(admin))
    assert r.status_code == 404


def test_score_donnees_invalides(client, db_session, admin):
    payload = {
        "pernr_lead": "5000002",
        "heure_connexion": 9.4,
        "nb_fiches_consultees": "beaucoup",
        "hors_departement": False,
        "duree_minutes": 60,
    }
    r = client.post("/ueba/score", json=payload, headers=auth_headers(admin))
    assert r.status_code == 422


def test_regle_hybride_nouveaute_seule_declenche_alerte(client, db_session, admin):
    """Règle hybride (reference/entrainement_v2_5signaux.py §6) : 4 signaux
    normaux mais nouveauté élevée -> suspect via novelty_zscore > 2, hors modèle."""
    _seed_historique_lecture(db_session, "5000002")
    payload = {
        "pernr_lead": "5000002",
        "heure_connexion": 8.0,
        "nb_fiches_consultees": 40,
        "hors_departement": False,
        "duree_minutes": 45,
        "pernrs_consultes": ["99001", "99002", "99003", "99004", "99005", "99006"],
    }
    r = client.post("/ueba/score", json=payload, headers=auth_headers(admin))
    data = r.json()

    assert r.status_code == 200
    assert data["signaux_calcules"]["novelty_zscore"] > 2
    assert abs(data["signaux_calcules"]["volume_zscore"]) < 2
    assert abs(data["signaux_calcules"]["heure_zscore"]) < 2
    assert data["est_suspect"] is True
    assert "nouveaute_cible" in data["raison_alerte"]


def test_score_lignes_historiques_sans_colonnes_ueba(client, db_session, admin):
    """Lignes d'audit antérieures à la migration (target_pernrs / perimetre NULL) :
    le scoring retombe sur les 3 signaux fiables, sans planter ni inventer."""
    for d in range(10):
        jour = dt.date(2026, 7, 1) + dt.timedelta(days=d)
        for off in (0, 20, 41):
            db_session.add(AuditLog(
                qui="5000003", action="FORECAST_READ",
                detail=f"role=EUM_EUD perimetre=department:DEP1 start=- end=- lignes={12 + d % 4}",
                ip="127.0.0.1",
                quand=dt.datetime.combine(jour, dt.time(9, 0)) + dt.timedelta(minutes=off),
                target_pernrs=None, perimetre=None,
            ))
    db_session.commit()

    payload = {
        "pernr_lead": "5000003",
        "heure_connexion": 9.1,
        "nb_fiches_consultees": 13,
        "hors_departement": True,   # sera neutralisé côté agrégat historique, mais ici fourni explicitement
        "duree_minutes": 40,
    }
    r = client.post("/ueba/score", json=payload, headers=auth_headers(admin))
    assert r.status_code == 200
    assert "signaux_calcules" in r.json()


# --------------------------------------------------------------------------
# RBAC : /ueba/* réservé à ADMIN (app.deps.require_roles)
# --------------------------------------------------------------------------
def test_ueba_score_refuse_non_admin(client, db_session):
    lead = make_user(db_session, pernr="LEAD9", nom="Lead", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()
    r = client.post("/ueba/score", json={
        "pernr_lead": "5000002", "heure_connexion": 8.0, "nb_fiches_consultees": 10,
        "hors_departement": False, "duree_minutes": 30,
    }, headers=auth_headers(lead))
    assert r.status_code == 403


def test_ueba_anomalies_refuse_non_admin(client, db_session):
    hod = make_user(db_session, pernr="HOD9", nom="Head", role=Role.HEAD_OF_DIRECTION, direction_id="D1")
    db_session.commit()
    r = client.get("/ueba/anomalies", headers=auth_headers(hod))
    assert r.status_code == 403


def test_ueba_anomalies_accepte_admin(client, db_session, admin):
    r = client.get("/ueba/anomalies", headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json() == []


def test_ueba_sans_jeton_est_401(client):
    r = client.get("/ueba/anomalies")
    assert r.status_code == 401


# --------------------------------------------------------------------------
# Découplage : le scoring tourne en BackgroundTasks, jamais dans la réponse
# --------------------------------------------------------------------------
def test_scoring_est_planifie_en_tache_de_fond(client, db_session, monkeypatch):
    appels = []
    monkeypatch.setattr("app.routers.reference_data.planifier_rescore",
                        lambda bt, pernr, jour=None: appels.append(pernr))

    lead = make_user(db_session, pernr="LEADBG", nom="Lead BG", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    r = client.get("/employees", headers=auth_headers(lead))
    assert r.status_code == 200
    # La réponse ne porte aucun verdict de scoring...
    assert "est_suspect" not in r.text
    # ...mais le recalcul a bien été délégué à une tâche de fond pour ce lead.
    assert appels == ["LEADBG"]


def test_erreur_de_scoring_ne_casse_pas_la_requete(client, db_session, monkeypatch, tache_fond_sur_test_db):
    monkeypatch.setattr("ueba.tasks.charger_contexte",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom scoring")))

    lead = make_user(db_session, pernr="LEADERR", nom="Lead Err", role=Role.EUM_EUD, department_id="DEP1")
    db_session.commit()

    r = client.get("/employees", headers=auth_headers(lead))
    assert r.status_code == 200                      # l'échec de la tâche de fond est avalé
    assert db_session.query(UebaScore).count() == 0  # rien n'a été écrit


def test_scoring_background_ecrit_le_verdict(client, db_session, admin, tache_fond_sur_test_db):
    db_session.add(Direction(id="D1", nom="Dir"))
    db_session.add(Department(id="DEP1", nom="Dep", direction_id="D1", lead_pernr="LEADW", lead_titre="EUM"))
    db_session.add_all([
        Employee(pernr="70000001", nom="A", statut="Active", direction_id="D1", department_id="DEP1"),
        Employee(pernr="70000002", nom="B", statut="Active", direction_id="D1", department_id="DEP1"),
    ])
    lead = make_user(db_session, pernr="LEADW", nom="Lead W", role=Role.EUM_EUD, department_id="DEP1")
    _seed_historique_lecture(db_session, "LEADW")

    r = client.get("/employees", headers=auth_headers(lead))
    assert r.status_code == 200

    lignes = db_session.query(UebaScore).filter(UebaScore.pernr_lead == "LEADW").all()
    assert len(lignes) == 1
    assert lignes[0].jour == dt.datetime.utcnow().date().isoformat()
    assert isinstance(lignes[0].est_suspect, bool)


def test_erreur_de_scoring_est_loggee_en_error(monkeypatch, caplog, tache_fond_sur_test_db):
    """Une exception dans rescore_lead_jour est avalée (tâche de fond) MAIS tracée :
    un enregistrement de niveau ERROR mentionnant le lead et le jour doit être émis."""
    from ueba.tasks import rescore_lead_jour

    def _boom(*_a, **_k):
        raise RuntimeError("échec simulé du chargement du contexte")

    monkeypatch.setattr("ueba.tasks.charger_contexte", _boom)

    with caplog.at_level(logging.ERROR, logger="ueba.tasks"):
        rescore_lead_jour("LEAD_KO", "2026-08-15")  # ne doit pas lever

    erreurs = [r for r in caplog.records if r.levelno == logging.ERROR and r.name == "ueba.tasks"]
    assert len(erreurs) == 1
    message = erreurs[0].getMessage()
    assert "LEAD_KO" in message
    assert "2026-08-15" in message
    assert erreurs[0].exc_info is not None  # logger.exception -> trace jointe
