import datetime as dt
import math

from .database import Base, engine, SessionLocal
from .models import Direction, Department, AppUser, Role, ActivityCode, Employee, Project, ForecastEntry
from .security import hash_password, generate_totp_secret, generate_strong_password

# Référentiel des codes d'activité — cahier des charges §2.3, jamais reconstitué ailleurs
# dans l'application par une liste de codes en dur (famille/couleur/règle R1 portées ici).
ACTIVITY_CODES = [
    ("P", "Production", "Production", True, "#0070AD"),
    ("BP", "Bench Projet", "Bench", False, "#8FC7E8"),
    ("HB", "Hard Bench", "Bench", False, "#C9D6E3"),
    ("M", "Management", "Management", False, "#5B4B9C"),
    ("F", "Formation", "Formation", False, "#2FA88E"),
    ("ALTS", "Alternant School", "Alternance", False, "#E8A33D"),
    ("ALTC", "Alternant Cap", "Alternance", False, "#E8A33D"),
    ("CP", "Congé payé", "Absence", False, "#D9534F"),
    ("EL", "Exceptional Leave", "Absence", False, "#D9534F"),
    ("SS", "Sans Solde", "Absence", False, "#D9534F"),
    ("MAT", "Maternité", "Absence", False, "#D9534F"),
]

# Résolution des codes utilisés par le générateur d'historique de démo (_seed_forecast_entries
# ci-dessous) par libellé, plutôt que retapés séparément en littéraux — si ACTIVITY_CODES
# change un code, ce générateur suit automatiquement au lieu de risquer de produire un code
# devenu inexistant du référentiel. Un libellé introuvable lève une KeyError au chargement du
# module, immédiatement, plutôt qu'une divergence silencieuse découverte plus tard en base.
_CODE_BY_LIBELLE = {libelle: code for code, libelle, *_ in ACTIVITY_CODES}
_CODE_PRODUCTION = _CODE_BY_LIBELLE["Production"]
_CODE_BENCH_PROJET = _CODE_BY_LIBELLE["Bench Projet"]
_CODE_HARD_BENCH = _CODE_BY_LIBELLE["Hard Bench"]
_CODE_MANAGEMENT = _CODE_BY_LIBELLE["Management"]
_CODE_FORMATION = _CODE_BY_LIBELLE["Formation"]
_CODE_CONGE_PAYE = _CODE_BY_LIBELLE["Congé payé"]
_CODE_EXCEPTIONAL_LEAVE = _CODE_BY_LIBELLE["Exceptional Leave"]
_CODE_SANS_SOLDE = _CODE_BY_LIBELLE["Sans Solde"]


def seed_activity_codes(db):
    """Peuple activity_code une seule fois (idempotent) — à appeler au démarrage de l'app."""
    if db.query(ActivityCode).count() > 0:
        return
    for code, libelle, famille, projet_obligatoire, couleur in ACTIVITY_CODES:
        db.add(ActivityCode(
            code=code, libelle=libelle, famille=famille,
            projet_obligatoire=projet_obligatoire, couleur=couleur,
        ))
    db.commit()

DIRECTIONS = [
    ("D1", "Ingénierie Automobile"),
    ("D2", "Aéronautique & Défense"),
    ("D3", "Énergie & Utilities"),
    ("D4", "Digital Manufacturing"),
]

DEPARTMENTS = [
    ("DEP1", "Powertrain Systems", "D1", "0010001", "EUM"),
    ("DEP2", "ADAS & Perception", "D1", "0010002", "EUD"),
    ("DEP3", "Avionique Embarquée", "D2", "0010003", "EUM"),
    ("DEP4", "Structures & Matériaux", "D2", "0010004", "EUD"),
    ("DEP5", "Réseaux Intelligents", "D3", "0010005", "EUM"),
    ("DEP6", "Énergies Renouvelables", "D3", "0010006", "EUD"),
    ("DEP7", "Jumeau Numérique Usine", "D4", "0010007", "EUM"),
    ("DEP8", "Robotique & Automatisation", "D4", "0010008", "EUD"),
]

HOD_NAMES = ["Nadia", "Frédéric", "Malika", "Vincent"]

# --- Référentiel projets de démonstration (mêmes projets que l'ancienne maquette frontend) ---
PROJECTS = [
    ("PRJ-AUTO-014", "Plateforme e-Powertrain Gen4", "Stellantis", "actif"),
    ("PRJ-AUTO-021", "Perception ADAS L3", "Renault Group", "actif"),
    ("PRJ-AERO-007", "Calculateur Avionique NextGen", "Airbus", "actif"),
    ("PRJ-AERO-011", "Qualification Structures Composites", "Dassault Aviation", "actif"),
    ("PRJ-NRJ-003", "Supervision Smart Grid", "EDF", "actif"),
    ("PRJ-NRJ-009", "Parc Éolien Offshore — Monitoring", "TotalEnergies", "actif"),
    ("PRJ-MFG-002", "Jumeau Numérique Ligne Assemblage", "Safran", "actif"),
    ("PRJ-MFG-015", "Cellule Robotisée Collaborative", "Michelin", "actif"),
    ("PRJ-AUTO-005", "Banc d'essai Batteries v2", "Stellantis", "clôturé"),
    ("PRJ-AERO-004", "Cabine Connectée — Phase 1", "Airbus", "clôturé"),
]

_PROJECTS_BY_DIRECTION = {
    "D1": ["PRJ-AUTO-014", "PRJ-AUTO-021"],
    "D2": ["PRJ-AERO-007", "PRJ-AERO-011"],
    "D3": ["PRJ-NRJ-003", "PRJ-NRJ-009"],
    "D4": ["PRJ-MFG-002", "PRJ-MFG-015"],
}

# --- Générateur d'employés de démonstration (port fidèle de l'ancien buildEmployeesForDept
# du frontend, src/data/mockData.ts — même hiérarchie, mêmes PERNR, pour que la démo garde
# le même rendu visuel désormais réellement persisté en base) ---
_PRENOMS = ['Amine', 'Sarah', 'Youssef', 'Léa', 'Karim', 'Nora', 'Hamza', 'Camille', 'Reda', 'Inès',
            'Yassine', 'Chloé', 'Omar', 'Manon', 'Tarik', 'Julie', 'Sofia', 'Nabil', 'Lucas', 'Salma']
_NOMS = ['Benali', 'Martin', 'El Amrani', 'Dubois', 'Cherkaoui', 'Petit', 'Bennis', 'Moreau', 'Zahiri', 'Lefèvre',
         'Idrissi', 'Simon', 'Alaoui', 'Bertrand', 'Fassi', 'Girard', 'Ouali', 'Roux', 'Sabiri', 'Fournier']


def _pick(arr, i):
    return arr[i % len(arr)]


def _build_employees_for_dept(dep_id, dept_num, dir_id, lead_pernr, seed_start, hod_pernr=None):
    """
    Génère la hiérarchie de démonstration d'un département : 1 lead (racine) -> 2 people
    managers N1 -> par N1, 1 manager N2 + 3 feuilles sous N1 + 3 feuilles sous N2 (17
    collaborateurs par département, comme l'ancien générateur frontend). Le PERNR de
    chacun encode (département, niveau, index) pour garantir l'unicité globale — le
    générateur frontend d'origine tronquait cette information par découpage de chaîne et
    produisait en réalité des PERNR en doublon entre départements (invisible tant que les
    données restaient en mémoire côté navigateur, mais fatal avec la contrainte UNIQUE
    réelle de la table `employee`).

    Le lead (racine) est rattaché à `hod_pernr` s'il est fourni — le Head of Direction de sa
    propre direction (HOD0001..HOD0004).
    """
    out = []
    seed = seed_start

    out.append(dict(pernr=lead_pernr, nom=f"{_pick(_PRENOMS, seed)} {_pick(_NOMS, seed + 1)}",
                     manager_pernr=hod_pernr, statut="Active", direction_id=dir_id, department_id=dep_id))
    seed += 1

    n1_pernrs = []
    for i in range(2):
        pernr = f"00{dept_num}1{i}".rjust(7, "0")
        n1_pernrs.append(pernr)
        out.append(dict(pernr=pernr, nom=f"{_pick(_PRENOMS, seed)} {_pick(_NOMS, seed + 1)}",
                         manager_pernr=lead_pernr, statut="Active", direction_id=dir_id, department_id=dep_id))
        seed += 2

    for idx, n1_pernr in enumerate(n1_pernrs):
        n2_pernr = f"00{dept_num}2{idx}".rjust(7, "0")
        out.append(dict(pernr=n2_pernr, nom=f"{_pick(_PRENOMS, seed)} {_pick(_NOMS, seed + 1)}",
                         manager_pernr=n1_pernr, statut="Active", direction_id=dir_id, department_id=dep_id))
        seed += 2

        for i in range(3):
            pernr = f"0{dept_num}9{idx}{i}".rjust(7, "0")
            statut = "Unpaid Leave" if seed % 11 == 0 else ("Terminated" if seed % 13 == 0 else "Active")
            out.append(dict(pernr=pernr, nom=f"{_pick(_PRENOMS, seed)} {_pick(_NOMS, seed + 1)}",
                             manager_pernr=n1_pernr, statut=statut, direction_id=dir_id, department_id=dep_id))
            seed += 2

        for i in range(3):
            pernr = f"0{dept_num}8{idx}{i}".rjust(7, "0")
            statut = "Unpaid Leave" if seed % 11 == 0 else "Active"
            out.append(dict(pernr=pernr, nom=f"{_pick(_PRENOMS, seed)} {_pick(_NOMS, seed + 1)}",
                             manager_pernr=n2_pernr, statut=statut, direction_id=dir_id, department_id=dep_id))
            seed += 2

    return out


def _seed_employees(db, hod_pernr_by_direction=None):
    hod_pernr_by_direction = hod_pernr_by_direction or {}
    all_employees = []

    for i, (did, dir_nom) in enumerate(DIRECTIONS):
        hod_pernr = hod_pernr_by_direction.get(did)
        if not hod_pernr:
            continue
        all_employees.append(dict(pernr=hod_pernr, nom=HOD_NAMES[i], manager_pernr=None,
                                   statut="Active", direction_id=did, department_id=None))

    for i, (dep_id, nom, dir_id, lead_pernr, _lead_titre) in enumerate(DEPARTMENTS):
        dept_num = dep_id.replace("DEP", "")
        dept_hod_pernr = hod_pernr_by_direction.get(dir_id)
        all_employees.extend(_build_employees_for_dept(dep_id, dept_num, dir_id, lead_pernr, i * 17 + 3, dept_hod_pernr))
    for emp in all_employees:
        db.add(Employee(**emp))
    db.flush()
    return all_employees


def _seed_projects(db):
    for code, nom, client, statut in PROJECTS:
        db.add(Project(code=code, nom=nom, client=client, statut=statut))
    db.flush()


# --- Historique de démonstration (port fidèle de seedForecastEntries, src/data/seedForecast.ts) ---

def _iso_week1_monday(year: int) -> dt.date:
    jan4 = dt.date(year, 1, 4)
    day_of_week = jan4.isoweekday()  # lundi=1 ... dimanche=7
    return jan4 - dt.timedelta(days=day_of_week - 1)


def _current_monday() -> dt.date:
    today = dt.date.today()
    return today - dt.timedelta(days=today.isoweekday() - 1)


def _jours_ouvres(start_monday: dt.date, weeks: int) -> list[dt.date]:
    days = []
    for w in range(weeks):
        for d in range(5):
            days.append(start_monday + dt.timedelta(days=w * 7 + d))
    return days


def _seed_window() -> list[dt.date]:
    start = _current_monday() - dt.timedelta(days=28)
    return _jours_ouvres(start, 4)


def _pseudo_random(seed: float) -> float:
    x = math.sin(seed) * 10000
    return x - math.floor(x)


def _seed_forecast_entries(db, employees: list[dict]):
    by_manager: dict[str, int] = {}
    for emp in employees:
        if emp["manager_pernr"]:
            by_manager[emp["manager_pernr"]] = by_manager.get(emp["manager_pernr"], 0) + 1

    # department_id is None seulement pour un Head of Direction (racine hors périmètre
    # département) : il ne saisit pas de forecast, on ne lui en génère pas.
    active = [e for e in employees if e["statut"] in ("Active", "Unpaid Leave") and e["department_id"]]
    days = _seed_window()
    s = 1

    for emp in active:
        is_manager = emp["pernr"] in by_manager
        is_unpaid = emp["statut"] == "Unpaid Leave"
        dept_projects = _PROJECTS_BY_DIRECTION.get(emp["direction_id"], [PROJECTS[0][0]])

        for day in days:
            date_iso = day.isoformat()
            for demi in ("AM", "PM"):
                s += 1
                r = _pseudo_random(s + len(emp["pernr"]) * 97)
                code = _CODE_PRODUCTION
                project_code = dept_projects[math.floor(r * len(dept_projects))]

                if is_unpaid:
                    code, project_code = _CODE_SANS_SOLDE, None
                elif is_manager:
                    if r < 0.55:
                        code, project_code = _CODE_MANAGEMENT, None
                    elif r < 0.8:
                        code = _CODE_PRODUCTION
                    elif r < 0.92:
                        code, project_code = _CODE_BENCH_PROJET, None
                    else:
                        code, project_code = _CODE_FORMATION, None
                else:
                    if r < 0.72:
                        code = _CODE_PRODUCTION
                    elif r < 0.85:
                        code, project_code = _CODE_BENCH_PROJET, None
                    elif r < 0.9:
                        code, project_code = _CODE_HARD_BENCH, None
                    elif r < 0.95:
                        code, project_code = _CODE_FORMATION, None
                    elif r < 0.98:
                        code, project_code = _CODE_CONGE_PAYE, None
                    else:
                        code, project_code = _CODE_EXCEPTIONAL_LEAVE, None

                db.add(ForecastEntry(
                    pernr=emp["pernr"], date=date_iso, demi_journee=demi, code=code,
                    project_code=project_code if code == _CODE_PRODUCTION else None,
                    auteur="seed-demo",
                ))


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    created_accounts = []

    try:
        if db.query(Direction).count() > 0:
            print("Base déjà peuplée — rien à faire (supprimez backend/workforce.db pour reseeder).")
            return

        for did, nom in DIRECTIONS:
            db.add(Direction(id=did, nom=nom))
        db.flush()

        for dep_id, nom, dir_id, lead_pernr, lead_titre in DEPARTMENTS:
            db.add(Department(id=dep_id, nom=nom, direction_id=dir_id, lead_pernr=lead_pernr, lead_titre=lead_titre))
        db.flush()

        # Un compte EUM/EUD par département (PERNR du lead = identifiant de connexion)
        for dep_id, nom, dir_id, lead_pernr, lead_titre in DEPARTMENTS:
            secret = generate_totp_secret()
            pwd = generate_strong_password()
            db.add(AppUser(
                pernr=lead_pernr,
                nom=f"Lead {nom}",
                role=Role.EUM_EUD,
                direction_id=dir_id,
                department_id=dep_id,
                password_hash=hash_password(pwd),
                must_change_password=True,
                totp_secret=secret,
                totp_confirmed=False,
            ))
            created_accounts.append((lead_pernr, f"Lead {nom}", "EUM_EUD", pwd))

        # Un Head of Direction par direction — racine de sa propre direction dans la
        # hiérarchie People Manager (Employee.manager_pernr posé dans _seed_employees
        # ci-dessous), sans supérieur commun entre eux (cahier des charges : 3 rôles
        # seulement — EUM/EUD, Head of Direction scopé à une direction, Administrateur).
        hod_pernr_by_direction: dict[str, str] = {}
        for i, (did, nom) in enumerate(DIRECTIONS):
            pernr = f"HOD{i+1:04d}"
            hod_pernr_by_direction[did] = pernr
            secret = generate_totp_secret()
            pwd = generate_strong_password()
            db.add(AppUser(
                pernr=pernr,
                nom=f"{HOD_NAMES[i]} — Head of {nom}",
                role=Role.HEAD_OF_DIRECTION,
                direction_id=did,
                department_id=None,
                password_hash=hash_password(pwd),
                must_change_password=True,
                totp_secret=secret,
                totp_confirmed=False,
            ))
            created_accounts.append((pernr, f"{HOD_NAMES[i]} — Head of {nom}", "HEAD_OF_DIRECTION", pwd))

        # Administrateur global
        admin_secret = generate_totp_secret()
        admin_pwd = generate_strong_password()
        db.add(AppUser(
            pernr="ADMIN001",
            nom="Administrateur Global",
            role=Role.ADMIN,
            password_hash=hash_password(admin_pwd),
            must_change_password=True,
            totp_secret=admin_secret,
            totp_confirmed=False,
        ))
        created_accounts.append(("ADMIN001", "Administrateur Global", "ADMIN", admin_pwd))

        db.flush()

        # Référentiels collaborateurs/projets de démonstration, directement en base
        # (mêmes données que l'ancienne maquette frontend — cf. docstring plus haut).
        demo_employees = _seed_employees(db, hod_pernr_by_direction=hod_pernr_by_direction)
        _seed_projects(db)
        _seed_forecast_entries(db, demo_employees)

        db.commit()

        with open("CREDENTIALS_DEMO.md", "w", encoding="utf-8") as f:
            f.write("# Comptes de démonstration — Workforce Forecast\n\n")
            f.write("⚠️ À usage de développement uniquement. Ce fichier contient des mots de passe en clair : "
                    "ne le committez jamais dans un dépôt Git partagé, ne l'envoyez pas par email non chiffré.\n\n")
            f.write("Chaque compte a un mot de passe **aléatoire et unique**, généré à la création (pas de mot de "
                    "passe partagé — conforme NIST SP 800-63B rév. 4). La connexion **impose** de le changer "
                    "immédiatement (`must_change_password`), puis de configurer la double authentification "
                    "(un QR code s'affiche automatiquement, à scanner avec Google Authenticator / Microsoft "
                    "Authenticator / Authy).\n\n")
            f.write("| PERNR (identifiant) | Nom | Rôle | Mot de passe initial |\n|---|---|---|---|\n")
            for pernr, nom, role, pwd in created_accounts:
                f.write(f"| {pernr} | {nom} | {role} | `{pwd}` |\n")

        print(f"{len(created_accounts)} comptes créés avec des mots de passe uniques. "
              f"{len(demo_employees)} collaborateurs, {len(PROJECTS)} projets de démonstration. "
              f"Voir backend/CREDENTIALS_DEMO.md.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
