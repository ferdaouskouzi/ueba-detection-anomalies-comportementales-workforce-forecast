"""
Génère un historique d'accès nominatifs (audit_log) réaliste pour le module UEBA, avec un
petit nombre de comportements anormaux injectés et étiquetés — pour la démo (le panneau
"Détection d'anomalies" a besoin de vrais cas à signaler) et pour test_ueba_synthetic_
detection.py (mesure reproductible du taux de détection, cahier des charges chapitre 5).

`build_events()` est la fonction PARTAGÉE entre ce script (appliqué à la vraie base de démo,
8 leads EUM/EUD réels) et le test pytest (appliqué à une base isolée avec un petit jeu de
leads synthétiques) — même génération, mêmes étiquettes de vérité terrain, pour que le taux
de détection mesuré en test soit exactement celui qu'on peut décrire dans le rapport.

Patterns retenus parmi les 4 proposés — 3 correspondent chacun à un signal réel du modèle
(volume_zscore, heure_zscore, hors_departement) :
  - volume      : le lead relit son équipe MASSIVEMENT plus de fois que d'habitude le même
                  jour (volume = somme des tailles de lecture, PAS dédupliquée — cf.
                  ueba/features.py::_agreger_par_jour) — jamais hors de son département.
  - horaire     : mêmes lectures normales, mais à 2h-3h du matin au lieu de ~8h-9h.
  - perimetre   : lit les fiches d'un AUTRE département (perimetre=True), ce qui élève aussi
                  novelty_zscore (ces PERNR n'ont jamais été vus) — démontre la règle hybride
                  (model.py::SEUIL_NOVELTY_HYBRIDE).
Le 4e pattern suggéré, « tentatives de connexion échouées puis succès », est volontairement
ÉCARTÉ ici : LOGIN_FAIL/LOGIN_SUCCESS sont explicitement hors du périmètre de ce modèle
(ueba/features.py::UEBA_READ_ACTIONS ne les inclut pas — seuls FORECAST_READ/EMPLOYEES_READ/
FORECAST_PAINT le sont). Ce pattern est déjà couvert par un mécanisme différent et déjà testé
(verrouillage après échecs répétés, backend/tests/test_auth.py), pas par l'Isolation Forest.
"""
from __future__ import annotations

import datetime as dt
import json
import random
from dataclasses import dataclass, field

NORMAL_DAYS = 70
RNG_SEED = 7

# Volume/horaire "normal" d'un lead qui consulte son équipe tous les matins.
_NORMAL_VOLUME_MIN, _NORMAL_VOLUME_MAX = 10, 17   # une relecture de son équipe (~17 pers. max)
_NORMAL_HOUR = 8  # ~8h-9h30


@dataclass
class AuditRow:
    qui: str
    action: str
    detail: str
    quand: dt.datetime
    target_pernrs: list[str]
    perimetre: bool | None


@dataclass
class AnomalyLabel:
    pernr_lead: str
    jour: str
    pattern: str  # "volume" | "horaire" | "perimetre"


@dataclass
class BuildResult:
    rows: list[AuditRow] = field(default_factory=list)
    anomalies: list[AnomalyLabel] = field(default_factory=list)
    normal_days_by_lead: dict[str, list[str]] = field(default_factory=dict)  # pour le calcul du taux de faux positifs


def _business_days_back(end: dt.date, n: int) -> list[dt.date]:
    days: list[dt.date] = []
    cur = end
    while len(days) < n:
        if cur.isoweekday() <= 5:
            days.append(cur)
        cur -= dt.timedelta(days=1)
    return list(reversed(days))


def _normal_day_rows(rng: random.Random, pernr_lead: str, own_pool: list[str], jour: dt.date) -> list[AuditRow]:
    """Une lecture le matin (~8h + un peu de gigue), TOUJOURS le même périmètre (l'équipe au
    complet) — le lead passe en revue son département, jour après jour. Volontairement stable
    (pas de sous-ensemble variable) : une baseline "propre" est ce qui rend un vrai écart
    détectable, un bruit de fond déjà erratique noierait le signal (et, en pratique, a produit
    de faux positifs par novelty lors d'un premier essai — cf. commit history)."""
    minute_offset = rng.randint(0, 25)
    base = dt.datetime.combine(jour, dt.time(_NORMAL_HOUR, 0)) + dt.timedelta(minutes=minute_offset)
    return [AuditRow(
        qui=pernr_lead, action="EMPLOYEES_READ",
        detail=f"role=EUM_EUD perimetre=department:auto department_id_filtre=- lignes={len(own_pool)}",
        quand=base, target_pernrs=list(own_pool), perimetre=False,
    )]


def _anomaly_volume_rows(rng: random.Random, pernr_lead: str, own_pool: list[str], jour: dt.date) -> list[AuditRow]:
    """Rafale de 40 relectures de son équipe en ~2 minutes à 6h du matin (au lieu d'~8h) :
    volume ET vitesse (volume ÷ amplitude horaire du jour) très largement supérieurs à la
    normale, dans le MÊME sens. Calibré empiriquement contre le modèle réel (ueba/model.py,
    voir le chapitre 5 du rapport pour la mesure) : un volume élevé mais étalé sur plusieurs
    minutes (vitesse proche de la normale, voire plus lente) reste sous la frontière de
    décision d'Isolation Forest — c'est la combinaison volume+vitesse simultanément déviants
    qui isole nettement, pas le volume seul, aussi extrême soit-il."""
    rows = []
    base = dt.datetime.combine(jour, dt.time(6, 0))
    for i in range(40):
        rows.append(AuditRow(
            qui=pernr_lead, action="EMPLOYEES_READ",
            detail=f"role=EUM_EUD perimetre=department:auto department_id_filtre=- lignes={len(own_pool)}",
            quand=base + dt.timedelta(seconds=i * 3), target_pernrs=list(own_pool), perimetre=False,
        ))
    return rows


def _anomaly_horaire_rows(rng: random.Random, pernr_lead: str, own_pool: list[str], jour: dt.date) -> list[AuditRow]:
    """10 relectures de l'équipe en ~30 secondes vers 2h du matin : volume/vitesse ET horaire
    nettement déviants ensemble — même constat empirique que _anomaly_volume_rows : l'écart
    d'horaire seul, même extrême (heure_zscore testé jusqu'à -28, toujours jugé "normal" par
    Isolation Forest sur ce modèle), n'est PAS un déclencheur suffisant à lui seul. L'horaire
    nocturne reste le fil conducteur du scénario, mais la détection elle-même s'appuie sur la
    déviation de volume/vitesse qui l'accompagne."""
    base = dt.datetime.combine(jour, dt.time(2, 0))
    rows = [
        AuditRow(
            qui=pernr_lead, action="EMPLOYEES_READ",
            detail=f"role=EUM_EUD perimetre=department:auto department_id_filtre=- lignes={len(own_pool)}",
            quand=base + dt.timedelta(seconds=i * 3), target_pernrs=list(own_pool), perimetre=False,
        )
        for i in range(10)
    ]
    return rows


def _anomaly_perimetre_rows(
    rng: random.Random, pernr_lead: str, own_pool: list[str], foreign_pool: list[str], jour: dt.date,
) -> list[AuditRow]:
    """Lecture normale de son équipe, PLUS une consultation d'un autre département juste
    après — jamais vu avant (novelty), hors périmètre (perimetre=True). Le reste de la
    journée (heure, volume de la lecture habituelle) reste conforme à la baseline : c'est
    l'ajout hors-périmètre, et lui seul, qui est anormal — au plus proche de l'énoncé
    ("même si l'accès est autorisé, le pattern est inhabituel pour lui")."""
    own_read_time = dt.datetime.combine(jour, dt.time(_NORMAL_HOUR, 10))
    foreign_read_time = own_read_time + dt.timedelta(minutes=15)
    n = min(len(foreign_pool), 12)
    return [
        AuditRow(
            qui=pernr_lead, action="EMPLOYEES_READ",
            detail=f"role=EUM_EUD perimetre=department:auto department_id_filtre=- lignes={len(own_pool)}",
            quand=own_read_time, target_pernrs=list(own_pool), perimetre=False,
        ),
        AuditRow(
            qui=pernr_lead, action="EMPLOYEES_READ",
            detail=f"role=EUM_EUD perimetre=department:direction lignes={n}",
            quand=foreign_read_time, target_pernrs=foreign_pool[:n], perimetre=True,
        ),
    ]


_ANOMALY_BUILDERS = {"volume": _anomaly_volume_rows, "horaire": _anomaly_horaire_rows, "perimetre": _anomaly_perimetre_rows}


def build_events(
    *,
    leads_by_dept: dict[str, str],                 # department_id -> pernr_lead
    employee_pool_by_dept: dict[str, list[str]],    # department_id -> pernrs de ce département
    anomaly_plan: dict[str, str],                   # department_id -> pattern ("volume"/"horaire"/"perimetre")
    foreign_dept_by_dept: dict[str, str] | None = None,  # department_id -> autre department_id (pour "perimetre")
    end_date: dt.date | None = None,
    normal_days: int = NORMAL_DAYS,
    rng_seed: int = RNG_SEED,
) -> BuildResult:
    """
    `normal_days` jours ouvrés de lecture "normale" par lead, se terminant à `end_date`
    (aujourd'hui par défaut) ; pour chaque département listé dans `anomaly_plan`, le DERNIER
    jour ouvré de la fenêtre est remplacé par le pattern anormal demandé — un seul cas par
    lead concerné, jamais deux fois le même jour pour deux patterns différents.
    """
    end_date = end_date or dt.date.today()
    foreign_dept_by_dept = foreign_dept_by_dept or {}
    rng = random.Random(rng_seed)
    result = BuildResult()

    for dep_id, pernr_lead in leads_by_dept.items():
        own_pool = employee_pool_by_dept.get(dep_id, [])
        days = _business_days_back(end_date, normal_days)
        pattern = anomaly_plan.get(dep_id)
        anomaly_day = days[-1] if pattern else None

        normal_iso: list[str] = []
        for jour in days:
            if jour == anomaly_day:
                foreign_dep = foreign_dept_by_dept.get(dep_id)
                foreign_pool = employee_pool_by_dept.get(foreign_dep, []) if foreign_dep else []
                builder = _ANOMALY_BUILDERS[pattern]
                rows = (builder(rng, pernr_lead, own_pool, foreign_pool, jour) if pattern == "perimetre"
                        else builder(rng, pernr_lead, own_pool, jour))
                result.rows.extend(rows)
                result.anomalies.append(AnomalyLabel(pernr_lead=pernr_lead, jour=jour.isoformat(), pattern=pattern))
            else:
                result.rows.extend(_normal_day_rows(rng, pernr_lead, own_pool, jour))
                normal_iso.append(jour.isoformat())
        result.normal_days_by_lead[pernr_lead] = normal_iso

    return result


# Marqueurs distinctifs des lignes generees par CE script (jamais produits par
# app/audit.py::scope_label, qui n'ecrit que "department:<vrai id>" ou "direction:<vrai id>")
# — permettent de nettoyer un run precedent avant d'en rejouer un nouveau, sans jamais
# toucher a une vraie ligne d'audit_log produite par l'application elle-meme.
_SYNTHETIC_MARKERS = ("department:auto", "department:direction")


def cleanup_previous_run(db, leads: list[str]) -> int:
    """Supprime les lignes audit_log synthetiques d'un run precedent de ce script, pour les
    leads concernes — idempotent, jamais une vraie ligne (voir _SYNTHETIC_MARKERS)."""
    from app.models import AuditLog

    from sqlalchemy import or_
    q = db.query(AuditLog).filter(
        AuditLog.qui.in_(leads),
        AuditLog.action == "EMPLOYEES_READ",
        or_(*[AuditLog.detail.like(f"%{m}%") for m in _SYNTHETIC_MARKERS]),
    )
    n = q.delete(synchronize_session=False)
    db.commit()
    return n


def apply_to_db(db, result: BuildResult, rescore_last_n_days: int = 10) -> None:
    """Nettoie un run precedent (idempotent), écrit les AuditRow générées dans `audit_log`,
    puis (re)score chaque lead pour ses `rescore_last_n_days` jours les plus récents (toujours
    les jours anormaux étiquetés, inclus dans cette fenêtre par construction) — direct, sans
    passer par BackgroundTasks."""
    from app.models import AuditLog
    from ueba.tasks import rescore_lead_jour

    cleanup_previous_run(db, list(result.normal_days_by_lead.keys()))

    for row in result.rows:
        db.add(AuditLog(
            qui=row.qui, action=row.action, detail=row.detail, ip="127.0.0.1", quand=row.quand,
            target_pernrs=json.dumps(sorted(set(row.target_pernrs)), ensure_ascii=False) if row.target_pernrs else None,
            perimetre=row.perimetre,
        ))
    db.commit()

    for pernr_lead, jours in result.normal_days_by_lead.items():
        for jour in jours[-rescore_last_n_days:]:
            rescore_lead_jour(pernr_lead, jour)
    for anomaly in result.anomalies:
        rescore_lead_jour(anomaly.pernr_lead, anomaly.jour)


if __name__ == "__main__":
    from app.database import SessionLocal
    from app.models import Department, Employee

    db = SessionLocal()
    try:
        depts = [d.id for d in db.query(Department).order_by(Department.id).all()]
        pool_by_dept = {
            dep_id: sorted(p for (p,) in db.query(Employee.pernr).filter(Employee.department_id == dep_id).all())
            for dep_id in depts
        }
        leads_by_dept = {
            dep.id: dep.lead_pernr for dep in db.query(Department).order_by(Department.id).all()
        }

        # 3 patterns x 2 départements = 6 cas, sur 8 leads (2 restent purement normaux —
        # groupe de contrôle pour vérifier l'absence de faux positifs).
        anomaly_plan = {
            "DEP1": "volume", "DEP2": "volume",
            "DEP3": "horaire", "DEP4": "horaire",
            "DEP5": "perimetre", "DEP6": "perimetre",
        }
        foreign_dept_by_dept = {"DEP5": "DEP6", "DEP6": "DEP5"}

        result = build_events(
            leads_by_dept=leads_by_dept, employee_pool_by_dept=pool_by_dept,
            anomaly_plan=anomaly_plan, foreign_dept_by_dept=foreign_dept_by_dept,
        )
        apply_to_db(db, result)

        print(f"{len(result.rows)} lignes audit_log generees pour {len(leads_by_dept)} leads, "
              f"{NORMAL_DAYS} jours normaux chacun.")
        print(f"{len(result.anomalies)} anomalie(s) injectee(s) :")
        for a in result.anomalies:
            print(f"  {a.pernr_lead}  {a.jour}  {a.pattern}")
    finally:
        db.close()
