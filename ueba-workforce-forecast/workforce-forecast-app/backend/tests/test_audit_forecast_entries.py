"""
GET /audit/forecast-entries — exposition ADMIN des écritures de la grille de
prévision (audit_log, action="FORECAST_PAINT").

  - RBAC : 403 pour tout rôle != ADMIN, 200 pour ADMIN.
  - Réponse structurée (pas la chaîne `detail` brute), parsée pour les 3 chemins
    d'écriture réels de routers/forecast.py : création, mise à jour, effacement.
  - Robustesse : une ligne FORECAST_PAINT au `detail` non conforme est exclue
    sans faire échouer la requête, et signalée en WARNING avec son id.
  - Plage de dates `depuis` / `jusqua` : bornes INCLUSES, appliquées au JOUR de
    `AuditLog.quand`, jamais au champ `date` du `detail`.
"""
import datetime as dt
import logging

from app.models import AuditLog, Role

from .conftest import auth_headers, make_user


def _admin(db_session):
    u = make_user(db_session, pernr="ADM1", nom="Admin", role=Role.ADMIN)
    db_session.commit()
    return u


def _seed_multi_jours(db_session):
    """Une écriture FORECAST_PAINT par jour, du 18 au 22 août 2026, horodatée à
    midi. Le `date=` du `detail` (jour du créneau) est volontairement fixé en
    SEPTEMBRE pour toutes : si un test filtrait par erreur sur le detail plutôt
    que sur `quand`, il le verrait immédiatement."""
    for d in range(18, 23):
        db_session.add(AuditLog(
            qui="LEAD1", action="FORECAST_PAINT", ip="127.0.0.1",
            quand=dt.datetime(2026, 8, d, 12, 0, 0),
            detail=f"pernr=0010001 date=2026-09-01 AM avant=— apres=P/PRJ-{d:03d}",
            target_pernrs='["0010001"]', perimetre=False,
        ))
    db_session.commit()


def _seed_paint_lignes(db_session):
    """Un jeu réaliste : les 3 formats que routers/forecast.py écrit réellement,
    plus une ligne parasite au format inattendu."""
    base = dt.datetime(2026, 8, 20, 9, 0, 0)
    db_session.add_all([
        # création (créneau vide -> P/PRJ-001)
        AuditLog(qui="LEAD1", action="FORECAST_PAINT", ip="127.0.0.1",
                 quand=base,
                 detail="pernr=0010001 date=2026-08-21 AM avant=— apres=P/PRJ-001",
                 target_pernrs='["0010001"]', perimetre=False),
        # mise à jour (P/PRJ-001 -> CP)
        AuditLog(qui="LEAD1", action="FORECAST_PAINT", ip="127.0.0.1",
                 quand=base + dt.timedelta(minutes=5),
                 detail="pernr=0010001 date=2026-08-21 AM avant=P/PRJ-001 apres=CP",
                 target_pernrs='["0010001"]', perimetre=False),
        # effacement
        AuditLog(qui="LEAD1", action="FORECAST_PAINT", ip="127.0.0.1",
                 quand=base + dt.timedelta(minutes=10),
                 detail="pernr=0010001 date=2026-08-21 PM avant=CP apres=— (effacement)",
                 target_pernrs='["0010001"]', perimetre=False),
        # ligne parasite : format inattendu -> doit être exclue, pas planter
        AuditLog(qui="LEAD1", action="FORECAST_PAINT", ip="127.0.0.1",
                 quand=base + dt.timedelta(minutes=15),
                 detail="format historique sans les cles attendues",
                 target_pernrs=None, perimetre=None),
        # bruit : une autre action ne doit jamais ressortir ici
        AuditLog(qui="LEAD1", action="FORECAST_READ", ip="127.0.0.1",
                 quand=base + dt.timedelta(minutes=20),
                 detail="role=EUM_EUD perimetre=department:DEP1 start=- end=- lignes=3"),
    ])
    db_session.commit()


def test_refuse_non_admin(client, db_session):
    lead = make_user(db_session, pernr="LEAD1", nom="Lead", role=Role.EUM_EUD, department_id="DEP1")
    hod = make_user(db_session, pernr="HOD1", nom="Head", role=Role.HEAD_OF_DIRECTION, direction_id="D1")
    db_session.commit()

    assert client.get("/audit/forecast-entries", headers=auth_headers(lead)).status_code == 403
    assert client.get("/audit/forecast-entries", headers=auth_headers(hod)).status_code == 403


def test_sans_jeton_est_401(client):
    assert client.get("/audit/forecast-entries").status_code == 401


def test_admin_reponse_parsee(client, db_session, caplog):
    admin = make_user(db_session, pernr="ADM1", nom="Admin", role=Role.ADMIN)
    db_session.commit()
    _seed_paint_lignes(db_session)

    with caplog.at_level(logging.WARNING, logger="app.routers.audit"):
        r = client.get("/audit/forecast-entries", headers=auth_headers(admin))

    assert r.status_code == 200
    data = r.json()

    # 4 lignes FORECAST_PAINT en base, mais la parasite est exclue -> 3 sorties,
    # les plus récentes d'abord (effacement, puis mise à jour, puis création).
    assert len(data) == 3
    assert [d["apres"] for d in data] == ["— (effacement)", "CP", "P/PRJ-001"]

    effacement, maj, creation = data

    assert creation == {
        "quand": "2026-08-20T09:00:00", "qui": "LEAD1", "pernr": "0010001",
        "date": "2026-08-21", "demi": "AM", "avant": "—", "apres": "P/PRJ-001",
    }
    assert maj["avant"] == "P/PRJ-001" and maj["apres"] == "CP" and maj["demi"] == "AM"
    assert effacement["demi"] == "PM" and effacement["avant"] == "CP"

    # aucune chaîne `detail` brute renvoyée
    assert all("detail" not in d for d in data)

    # la ligne inattendue est signalée en WARNING avec son id
    parasite_id = (
        db_session.query(AuditLog)
        .filter(AuditLog.detail == "format historique sans les cles attendues")
        .one().id
    )
    warns = [rec for rec in caplog.records if rec.levelno == logging.WARNING and rec.name == "app.routers.audit"]
    assert len(warns) == 1
    assert str(parasite_id) in warns[0].getMessage()


def test_admin_base_vide(client, db_session):
    admin = make_user(db_session, pernr="ADM1", nom="Admin", role=Role.ADMIN)
    db_session.commit()

    r = client.get("/audit/forecast-entries", headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json() == []


def test_parametre_limite(client, db_session):
    admin = make_user(db_session, pernr="ADM1", nom="Admin", role=Role.ADMIN)
    db_session.commit()
    _seed_paint_lignes(db_session)

    r = client.get("/audit/forecast-entries?limite=2", headers=auth_headers(admin))
    assert r.status_code == 200
    body = r.json()
    # limite appliquée AVANT le parsing : 2 lignes lues (parasite + effacement),
    # la parasite tombe -> 1 sortie.
    assert len(body) == 1
    assert body[0]["apres"] == "— (effacement)"

    assert client.get("/audit/forecast-entries?limite=0", headers=auth_headers(admin)).status_code == 422


# --------------------------------------------------------------------------
# Plage de dates depuis / jusqua (mêmes type/sémantique que /ueba/anomalies)
# --------------------------------------------------------------------------
def _apres(body):
    return [d["apres"] for d in body]


def test_sans_plage_comportement_inchange(client, db_session):
    admin = _admin(db_session)
    _seed_multi_jours(db_session)
    r = client.get("/audit/forecast-entries", headers=auth_headers(admin))
    assert r.status_code == 200
    # 5 jours, les plus récents d'abord
    assert _apres(r.json()) == ["P/PRJ-022", "P/PRJ-021", "P/PRJ-020", "P/PRJ-019", "P/PRJ-018"]


def test_depuis_seul_borne_basse_incluse(client, db_session):
    admin = _admin(db_session)
    _seed_multi_jours(db_session)
    r = client.get("/audit/forecast-entries?depuis=2026-08-20", headers=auth_headers(admin))
    assert r.status_code == 200
    assert _apres(r.json()) == ["P/PRJ-022", "P/PRJ-021", "P/PRJ-020"]


def test_jusqua_seul_borne_haute_incluse(client, db_session):
    admin = _admin(db_session)
    _seed_multi_jours(db_session)
    r = client.get("/audit/forecast-entries?jusqua=2026-08-20", headers=auth_headers(admin))
    assert r.status_code == 200
    # 2026-08-20 est INCLUS malgré l'heure 12:00 sur `quand` (filtre au jour).
    assert _apres(r.json()) == ["P/PRJ-020", "P/PRJ-019", "P/PRJ-018"]


def test_depuis_et_jusqua_ensemble(client, db_session):
    admin = _admin(db_session)
    _seed_multi_jours(db_session)
    r = client.get("/audit/forecast-entries?depuis=2026-08-19&jusqua=2026-08-21", headers=auth_headers(admin))
    assert r.status_code == 200
    assert _apres(r.json()) == ["P/PRJ-021", "P/PRJ-020", "P/PRJ-019"]


def test_depuis_egal_jusqua_un_seul_jour(client, db_session):
    admin = _admin(db_session)
    _seed_multi_jours(db_session)
    r = client.get("/audit/forecast-entries?depuis=2026-08-20&jusqua=2026-08-20", headers=auth_headers(admin))
    assert r.status_code == 200
    assert _apres(r.json()) == ["P/PRJ-020"]


def test_plage_sans_aucune_ligne_est_liste_vide(client, db_session):
    admin = _admin(db_session)
    _seed_multi_jours(db_session)
    r = client.get("/audit/forecast-entries?depuis=2027-01-01&jusqua=2027-12-31", headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json() == []


def test_jusqua_inferieur_a_depuis_est_liste_vide(client, db_session):
    admin = _admin(db_session)
    _seed_multi_jours(db_session)
    # Bornes AND-ées : une plage inversée ne peut rien contenir. Pas d'erreur.
    r = client.get("/audit/forecast-entries?depuis=2026-08-22&jusqua=2026-08-18", headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json() == []


def test_plage_filtre_sur_quand_pas_sur_le_detail(client, db_session):
    admin = _admin(db_session)
    _seed_multi_jours(db_session)
    # Tous les créneaux du `detail` sont datés 2026-09-01 ; `quand` est en août.
    # Un filtre septembre ne doit RIEN renvoyer (sinon = filtre sur le detail).
    r = client.get("/audit/forecast-entries?depuis=2026-09-01&jusqua=2026-09-30", headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json() == []


def test_limite_tronque_a_l_interieur_d_une_plage(client, db_session):
    admin = _admin(db_session)
    _seed_multi_jours(db_session)
    r = client.get(
        "/audit/forecast-entries?depuis=2026-08-18&jusqua=2026-08-22&limite=2",
        headers=auth_headers(admin),
    )
    assert r.status_code == 200
    # plage = 5 jours, limite = 2 -> les 2 plus récents de la plage
    assert _apres(r.json()) == ["P/PRJ-022", "P/PRJ-021"]
