"""
Génère un historique de forecast réaliste et varié sur l'ensemble du périmètre de démo
(4 directions, 8 départements, 136 collaborateurs actifs) — utilisé pour le chapitre 5
(Réalisation et tests) du rapport de PFA.

Contrairement à seed.py::run() (idempotent, ne touche à rien si la base est déjà peuplée),
ce script est un outil de RAFRAÎCHISSEMENT DES DONNÉES DE FORECAST SEULEMENT : il ne crée
ni ne modifie jamais Direction / Department / Employee / AppUser / Project — il ne fait que
remplacer les ForecastEntry marquées auteur="seed-demo" (jamais une saisie réelle d'un
utilisateur, reconnaissable à son auteur = nom du compte qui l'a saisie).

Fenêtre couverte : les 12 mois calendaires glissants jusqu'à aujourd'hui (même ancrage que
le préréglage "12 derniers mois" du dashboard, src/data/dashboardPeriod.ts::last12MonthsDays)
— jamais une date codée en dur — plus 10 jours ouvrés dans le futur proche, pour qu'un lead
qui navigue en avance sur ForecastGrid trouve aussi des semaines déjà planifiées (un
"forecast" se remplit par nature un peu à l'avance, pas seulement rétrospectivement).

Chaque département a un PROFIL distinct (répartition par famille d'activité), pour que les
graphiques racontent quelque chose de crédible en démo : certains départements très chargés
en Production (matures), d'autres avec plus de Bench ou de Formation/Alternance (montée en
compétence, pipeline moins rempli). Une tendance mensuelle (mois 1 -> mois 12) est appliquée
à la moitié des départements, plus un creux de Production / pic d'Absence en août (congés
d'été) et, plus léger, en décembre — communs à tous les départements, pour que la courbe
d'évolution mensuelle agrégée montre un vrai motif, pas juste du bruit.

Usage :
    cd backend && venv/Scripts/python.exe -m scripts.seed_forecast_history
"""
from __future__ import annotations

import datetime as dt
import random

from app.database import SessionLocal
from app.models import AuditLog, Department, Direction, Employee, ForecastEntry

SEED_AUTEUR = "seed-demo"
RNG_SEED = 42  # déterministe : deux exécutions successives produisent le même dataset.

# --- Fenêtre temporelle : 12 mois calendaires glissants (même définition que le frontend,
# src/data/dashboardPeriod.ts::last12MonthsDays), jamais une date codée en dur ------------

FUTURE_BUSINESS_DAYS = 10  # ~2 semaines ouvrées de saisies déjà planifiées en avance


def _add_months(d: dt.date, months: int) -> dt.date:
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    return dt.date(year, month, 1)


def _business_days(start: dt.date, end: dt.date) -> list[dt.date]:
    days = []
    cur = start
    while cur <= end:
        if cur.isoweekday() <= 5:
            days.append(cur)
        cur += dt.timedelta(days=1)
    return days


def _seed_window(today: dt.date) -> list[dt.date]:
    start = _add_months(dt.date(today.year, today.month, 1), -11)
    historique = _business_days(start, today)
    futur = _business_days(today + dt.timedelta(days=1), today + dt.timedelta(days=21))[:FUTURE_BUSINESS_DAYS]
    return historique + futur


# --- Profils par département : répartition-cible par famille pour un collaborateur
# "régulier" (non manager). Les 5 valeurs somment à 1.0. Ramp_up = tendance linéaire de
# Production sur les 12 mois (0 = plat, mature ; >0 = montée en charge progressive). ------

# nom, Production, Bench, Formation, Alternance, Absence, ramp_up (points de Production
# gagnés entre le 1er et le 12e mois, au détriment du Bench)
_PROFILES: dict[str, tuple[float, float, float, float, float, float]] = {
    "DEP1": (0.80, 0.08, 0.05, 0.02, 0.05, 0.00),  # Powertrain Systems — flagship mature
    "DEP2": (0.55, 0.22, 0.15, 0.03, 0.05, 0.12),  # ADAS & Perception — R&D, montée en charge
    "DEP3": (0.82, 0.06, 0.04, 0.02, 0.06, 0.00),  # Avionique Embarquée — certification, stable
    "DEP4": (0.62, 0.12, 0.06, 0.15, 0.05, 0.08),  # Structures & Matériaux — alternance forte
    "DEP5": (0.70, 0.12, 0.08, 0.04, 0.06, 0.00),  # Réseaux Intelligents — équilibré, stable
    "DEP6": (0.50, 0.30, 0.10, 0.03, 0.07, 0.15),  # Énergies Renouvelables — pipeline jeune
    "DEP7": (0.78, 0.09, 0.05, 0.03, 0.05, 0.00),  # Jumeau Numérique Usine — flagship mature
    "DEP8": (0.58, 0.15, 0.18, 0.04, 0.05, 0.10),  # Robotique & Automatisation — montée en compétence
}

_MANAGER_MANAGEMENT_SHARE = 0.40  # part fixe de Management pour les 5 managers/département ;
# le reste (0.60) suit le même profil départemental que les collaborateurs réguliers.

_BENCH_CODES = [("BP", 0.7), ("HB", 0.3)]
_ALTERNANCE_CODES = [("ALTS", 0.5), ("ALTC", 0.5)]
_ABSENCE_CODES = [("CP", 0.8), ("EL", 0.2)]


def _month_seasonal_absence_boost(month: int) -> float:
    """Creux de Production / pic d'Absence en août (congés d'été, motif très reconnaissable
    en France) et, plus léger, en décembre — commun à tous les départements."""
    if month == 8:
        return 0.15
    if month == 12:
        return 0.08
    return 0.0


def _resolve_month_progress(jour: dt.date, first_month: dt.date) -> float:
    """0.0 au premier mois de la fenêtre, 1.0 au dernier (12e) — position linéaire du mois de
    `jour` dans la fenêtre de 12 mois, pour interpoler la tendance de ramp-up."""
    delta_months = (jour.year - first_month.year) * 12 + (jour.month - first_month.month)
    return max(0.0, min(1.0, delta_months / 11))


def _weighted_choice(rng: random.Random, options: list[tuple[str, float]]) -> str:
    total = sum(w for _, w in options)
    r = rng.random() * total
    upto = 0.0
    for code, w in options:
        upto += w
        if r <= upto:
            return code
    return options[-1][0]


def _pick_family(rng: random.Random, dep_id: str, jour: dt.date, first_month: dt.date, is_manager: bool) -> str:
    prod, bench, formation, alternance, absence, ramp_up = _PROFILES[dep_id]

    progress = _resolve_month_progress(jour, first_month)
    drift = ramp_up * progress
    prod += drift
    bench = max(bench - drift, 0.01)

    seasonal = _month_seasonal_absence_boost(jour.month)
    prod = max(prod - seasonal, 0.05)
    absence += seasonal

    if is_manager:
        remaining = 1.0 - _MANAGER_MANAGEMENT_SHARE
        weights = [
            ("Management", _MANAGER_MANAGEMENT_SHARE),
            ("Production", prod * remaining),
            ("Bench", bench * remaining),
            ("Formation", formation * remaining),
            ("Alternance", alternance * remaining),
            ("Absence", absence * remaining),
        ]
    else:
        weights = [
            ("Production", prod), ("Bench", bench), ("Formation", formation),
            ("Alternance", alternance), ("Absence", absence),
        ]
    return _weighted_choice(rng, weights)


def _pick_code(rng: random.Random, family: str) -> str:
    if family == "Production":
        return "P"
    if family == "Bench":
        return _weighted_choice(rng, _BENCH_CODES)
    if family == "Management":
        return "M"
    if family == "Formation":
        return "F"
    if family == "Alternance":
        return _weighted_choice(rng, _ALTERNANCE_CODES)
    return _weighted_choice(rng, _ABSENCE_CODES)  # Absence


def _pick_project(rng: random.Random, dep_index_in_direction: int, dept_projects: list[str]) -> str:
    """Biaise vers un projet différent selon la place du département dans sa direction
    (le 1er département favorise le 1er projet, le 2e favorise le 2e) — pour que le
    graphique ETP par projet distingue aussi les départements d'une même direction."""
    if len(dept_projects) < 2:
        return dept_projects[0]
    favored = dep_index_in_direction % 2
    weights = [(code, 0.68 if i == favored else 0.32) for i, code in enumerate(dept_projects)]
    return _weighted_choice(rng, weights)


_PROJECTS_BY_DIRECTION = {
    "D1": ["PRJ-AUTO-014", "PRJ-AUTO-021"],
    "D2": ["PRJ-AERO-007", "PRJ-AERO-011"],
    "D3": ["PRJ-NRJ-003", "PRJ-NRJ-009"],
    "D4": ["PRJ-MFG-002", "PRJ-MFG-015"],
}


def generate() -> dict:
    db = SessionLocal()
    try:
        employees = db.query(Employee).filter(
            Employee.department_id.isnot(None),
            Employee.statut.in_(("Active", "Unpaid Leave")),
        ).all()
        by_manager: set[str] = {e.manager_pernr for e in db.query(Employee).all() if e.manager_pernr}
        dept_index_in_direction = {
            dep.id: idx % 2
            for idx, dep in enumerate(db.query(Department).order_by(Department.direction_id, Department.id).all())
        }

        today = dt.date.today()
        days = _seed_window(today)
        first_month = _add_months(dt.date(today.year, today.month, 1), -11)

        deleted = db.query(ForecastEntry).filter(ForecastEntry.auteur == SEED_AUTEUR).delete(synchronize_session=False)

        # Créneaux déjà occupés par une VRAIE saisie (auteur = nom d'un compte, jamais
        # "seed-demo" — posée via /forecast-entries/paint, donc par l'application elle-même,
        # pas par ce générateur) : jamais écrasés ni dupliqués, seulement contournés. C'est le
        # même principe que la marque seed-demo elle-même — ne jamais confondre les deux.
        occupes = {
            (pernr, date, demi)
            for pernr, date, demi in db.query(
                ForecastEntry.pernr, ForecastEntry.date, ForecastEntry.demi_journee,
            ).filter(ForecastEntry.auteur != SEED_AUTEUR).all()
        }

        rng = random.Random(RNG_SEED)
        rows: list[dict] = []
        per_dept_count: dict[str, int] = {}
        skipped_real = 0

        for emp in employees:
            is_manager = emp.pernr in by_manager
            is_unpaid = emp.statut == "Unpaid Leave"
            dept_projects = _PROJECTS_BY_DIRECTION.get(emp.direction_id, [])
            dep_idx = dept_index_in_direction.get(emp.department_id, 0)

            for jour in days:
                jour_iso = jour.isoformat()
                for demi in ("AM", "PM"):
                    if (emp.pernr, jour_iso, demi) in occupes:
                        skipped_real += 1
                        continue

                    if is_unpaid:
                        code, project_code = "SS", None
                    else:
                        family = _pick_family(rng, emp.department_id, jour, first_month, is_manager)
                        code = _pick_code(rng, family)
                        project_code = _pick_project(rng, dep_idx, dept_projects) if code == "P" else None

                    rows.append(dict(
                        pernr=emp.pernr, date=jour_iso, demi_journee=demi, code=code,
                        project_code=project_code, auteur=SEED_AUTEUR,
                        horodatage=dt.datetime.utcnow(),
                    ))
                    per_dept_count[emp.department_id] = per_dept_count.get(emp.department_id, 0) + 1

        db.bulk_insert_mappings(ForecastEntry, rows)

        db.add(AuditLog(
            qui="ADMIN001", action="SEED_CLEANUP",
            detail=(f"Regeneration de l historique de forecast de demo : {deleted} ForecastEntry "
                    f"auteur=seed-demo supprimees, {len(rows)} regenerees sur {len(employees)} "
                    f"collaborateurs actifs / 8 departements, fenetre {days[0].isoformat()} -> "
                    f"{days[-1].isoformat()} ({len(days)} jours) ; {skipped_real} creneaux "
                    f"contournes car deja occupes par une vraie saisie (auteur != seed-demo)."),
            ip="", quand=dt.datetime.utcnow(),
        ))
        db.commit()

        return {
            "deleted": deleted, "inserted": len(rows), "employees": len(employees),
            "window_start": days[0].isoformat(), "window_end": days[-1].isoformat(),
            "days": len(days), "per_dept_count": per_dept_count, "skipped_real": skipped_real,
        }
    finally:
        db.close()


if __name__ == "__main__":
    result = generate()
    print(f"{result['deleted']} ancienne(s) ligne(s) seed-demo supprimee(s).")
    print(f"{result['inserted']} lignes generees pour {result['employees']} collaborateurs actifs, "
          f"fenetre {result['window_start']} -> {result['window_end']} ({result['days']} jours).")
    print(f"{result['skipped_real']} creneaux contournes (deja occupes par une vraie saisie).")
    for dep_id, count in sorted(result["per_dept_count"].items()):
        print(f"  {dep_id}: {count} lignes")
