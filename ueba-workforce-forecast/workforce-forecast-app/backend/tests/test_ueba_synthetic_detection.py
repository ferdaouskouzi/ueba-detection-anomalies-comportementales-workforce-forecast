"""
Mesure REPRODUCTIBLE du taux de détection UEBA sur un dataset synthétique — chapitre 5
(Réalisation et tests) du rapport de PFA. Utilise EXACTEMENT le même générateur que
backend/scripts/seed_ueba_demo.py (la fonction `build_events`, importée directement, jamais
redupliquée) : le chiffre mesuré ici est donc celui qui a servi à peupler la démo, pas une
mesure séparée sur des données différentes.

3 patterns injectés (2 cas chacun, 6 au total, sur 8 leads — 2 leads restent purement
normaux comme groupe de contrôle) : volume, horaire, hors-périmètre. Le 4e pattern suggéré
dans la demande d'origine (tentatives de connexion échouées puis succès) est hors du
périmètre de CE modèle — voir le docstring de scripts/seed_ueba_demo.py.
"""
import datetime as dt

import pytest

from app.models import AppUser, AuditLog, Department, Direction, Employee, Role, UebaScore

from scripts.seed_ueba_demo import build_events

from .conftest import make_user

N_DEPTS = 8
EMPLOYEES_PER_DEPT = 15
END_DATE = dt.date(2026, 9, 2)  # fixe : la mesure ne doit pas varier selon le jour d'exécution

ANOMALY_PLAN = {
    "DEP1": "volume", "DEP2": "volume",
    "DEP3": "horaire", "DEP4": "horaire",
    "DEP5": "perimetre", "DEP6": "perimetre",
}
FOREIGN_DEPT_BY_DEPT = {"DEP5": "DEP6", "DEP6": "DEP5"}
CONTROL_DEPTS = {"DEP7", "DEP8"}  # aucune anomalie injectée — pour le taux de faux positifs


@pytest.fixture()
def tache_fond_sur_test_db(db_session, monkeypatch):
    """Fait tourner rescore_lead_jour (appelé par apply_to_db) sur la base de test isolée —
    par défaut il ouvrirait une session sur la vraie workforce.db (même fixture que
    tests/test_ueba.py::tache_fond_sur_test_db, dupliquée ici car locale à ce fichier)."""
    class _SansFermeture:
        def __getattr__(self, k):
            return getattr(db_session, k)

        def close(self):
            pass

    monkeypatch.setattr("ueba.tasks._nouvelle_session", lambda: _SansFermeture())


@pytest.fixture()
def synthetic_org(db_session):
    """4 directions / 8 départements / 15 employés chacun / 1 lead EUM_EUD par département —
    même forme que le référentiel réel (backend/app/seed.py), à plus petite échelle."""
    db_session.add_all([Direction(id=f"D{i}", nom=f"Direction {i}") for i in range(1, 5)])
    db_session.flush()

    leads_by_dept: dict[str, str] = {}
    pool_by_dept: dict[str, list[str]] = {}

    for i in range(1, N_DEPTS + 1):
        dep_id = f"DEP{i}"
        dir_id = f"D{((i - 1) // 2) + 1}"
        db_session.add(Department(id=dep_id, nom=f"Département {i}", direction_id=dir_id,
                                   lead_pernr=f"{i:07d}", lead_titre="EUM"))

        pool = [f"T{i}{j:03d}" for j in range(EMPLOYEES_PER_DEPT)]
        for pernr in pool:
            db_session.add(Employee(pernr=pernr, nom=f"Employe {pernr}", statut="Active",
                                     direction_id=dir_id, department_id=dep_id))
        pool_by_dept[dep_id] = pool

        lead_pernr = f"{i:07d}"
        make_user(db_session, pernr=lead_pernr, nom=f"Lead {i}", role=Role.EUM_EUD, department_id=dep_id)
        leads_by_dept[dep_id] = lead_pernr

    db_session.commit()
    return leads_by_dept, pool_by_dept


def test_taux_de_detection_sur_dataset_synthetique(db_session, synthetic_org, tache_fond_sur_test_db):
    """Génère le même dataset (normal + anomalies étiquetées) que la démo, score chaque jour
    concerné, puis compare le verdict du modèle à la vérité terrain connue — reproductible
    (seed RNG fixe, END_DATE fixe) : ce test doit produire le même résultat à chaque
    exécution, aujourd'hui comme dans un an."""
    leads_by_dept, pool_by_dept = synthetic_org

    from scripts.seed_ueba_demo import apply_to_db

    result = build_events(
        leads_by_dept=leads_by_dept, employee_pool_by_dept=pool_by_dept,
        anomaly_plan=ANOMALY_PLAN, foreign_dept_by_dept=FOREIGN_DEPT_BY_DEPT,
        end_date=END_DATE,
    )
    apply_to_db(db_session, result, rescore_last_n_days=5)

    assert len(result.anomalies) == 6, "vérité terrain attendue : 6 anomalies injectées"

    scores_by_key = {
        (row.pernr_lead, row.jour): row
        for row in db_session.query(UebaScore).all()
    }

    # --- Taux de détection : combien des 6 anomalies injectées sont bien signalées ---
    detected = 0
    for a in result.anomalies:
        row = scores_by_key.get((a.pernr_lead, a.jour))
        assert row is not None, f"pas de score calculé pour l'anomalie {a.pernr_lead}/{a.jour}"
        if row.est_suspect:
            detected += 1
    detection_rate = detected / len(result.anomalies)

    # --- Faux positifs : parmi les jours rescorés qui ne sont PAS des anomalies étiquetées ---
    anomaly_keys = {(a.pernr_lead, a.jour) for a in result.anomalies}
    normal_scored = [row for key, row in scores_by_key.items() if key not in anomaly_keys]
    false_positives = sum(1 for row in normal_scored if row.est_suspect)
    false_positive_rate = false_positives / len(normal_scored) if normal_scored else 0.0

    print(f"\n[UEBA] taux de détection = {detected}/{len(result.anomalies)} ({detection_rate:.0%})")
    print(f"[UEBA] faux positifs = {false_positives}/{len(normal_scored)} ({false_positive_rate:.0%})")

    # Le générateur est calibré empiriquement (voir scripts/seed_ueba_demo.py) pour que les 6
    # cas soient détectés de façon robuste, sans déclencher le moindre faux positif parmi les
    # jours normaux rescorés — un résultat strictement inférieur signale une régression du
    # modèle, du pipeline de scoring, ou du calibrage du générateur, pas une fluctuation
    # normale (tout est déterministe : seed RNG fixe, END_DATE fixe).
    assert detection_rate == 1.0
    assert false_positive_rate == 0.0


def test_pattern_horaire_seul_ne_declenche_pas_isolation_forest(db_session, synthetic_org, tache_fond_sur_test_db):
    """Constat empirique documenté dans scripts/seed_ueba_demo.py : sur ce modèle entraîné,
    un écart d'HORAIRE seul (même extrême) ne franchit pas la frontière de décision
    d'Isolation Forest — seule la combinaison avec un volume/vitesse également déviants le
    fait. Ce test verrouille ce constat : si un jour ne dévie QUE par l'horaire (volume et
    vitesse proches de la baseline), il ne doit PAS être détecté par le modèle seul (aucune
    raison "modele_isolation_forest") — sinon ce test, et la documentation associée,
    deviennent faux et doivent être corrigés ensemble."""
    from ueba.model import Baseline, evaluer

    baseline = Baseline(
        moyenne_volume=20.0, ecart_type_volume=2.0,
        moyenne_heure=8.15, ecart_type_heure=0.3,
        moyenne_vitesse=160.0, ecart_type_vitesse=15.0,
        moyenne_nouveaute=0.0, ecart_type_nouveaute=0.001,
        n_jours=70,
    )
    verdict = evaluer(
        pernr_lead="TEST", baseline=baseline,
        volume=20.0, heure_connexion=2.5, vitesse=160.0,
        hors_departement=False, score_nouveaute=0.0,
    )
    assert "modele_isolation_forest" not in (verdict["raison_alerte"] or "")
