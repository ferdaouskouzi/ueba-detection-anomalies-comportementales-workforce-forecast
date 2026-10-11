"""
Logique d'import des référentiels collaborateurs/projets (cahier des charges §2.3, §3.2,
§3.3). Fonctions pures, indépendantes de la base, pour rester testables unitairement
(voir backend/tests/test_import.py) — le routeur (reference_data.py) les appelle puis
applique les résultats en base.
"""

KNOWN_EMPLOYEE_STATUSES = {"Active", "Unpaid Leave", "Terminated", "Inactive"}

# Statuts projet reconnus à l'import — table de correspondance explicite (§2 point 5) :
# toute valeur absente de ces deux ensembles est rejetée, jamais devinée.
_PROJECT_STATUS_OPEN = {"active"}
_PROJECT_STATUS_CLOSED = {"closed", "clôturé", "cloture", "inactive", "terminated"}


def _get(row: dict, key: str) -> str:
    return str(row.get(key) if row.get(key) is not None else "").strip()


def normalize_project_status(raw: str) -> str | None:
    """'active' -> 'actif' ; synonymes reconnus de clôturé -> 'clôturé' ; sinon None (rejeté)."""
    v = (raw or "").strip().lower()
    if v in _PROJECT_STATUS_OPEN:
        return "actif"
    if v in _PROJECT_STATUS_CLOSED:
        return "clôturé"
    return None


def validate_employees(rows: list[dict], known_pernrs: set[str]) -> list[dict]:
    """
    Valide la feuille `people`. `known_pernrs` = PERNR déjà présents en base (pour la
    résolution du manager sur un ré-import partiel). Chaque entrée du fichier peut aussi
    référencer un manager présent plus loin dans le même fichier (ordre non garanti).

    Renvoie une liste de rapports {feuille, ligne, statut, motif, detail} — les lignes
    acceptées portent en plus les champs normalisés (pernr, nom, manager_pernr, statut,
    grade) prêts pour l'upsert.
    """
    pernrs_in_file = {_get(r, "pernr") for r in rows if _get(r, "pernr")}
    all_known = known_pernrs | pernrs_in_file

    seen: set[str] = set()
    report: list[dict] = []
    for i, row in enumerate(rows):
        ligne = i + 2  # +1 pour l'en-tête, +1 pour l'index 0-based
        pernr = _get(row, "pernr")

        if not pernr:
            report.append({"feuille": "people", "ligne": ligne, "statut": "rejeté",
                            "motif": "PERNR manquant", "detail": str(row)})
            continue
        if pernr in seen:
            report.append({"feuille": "people", "ligne": ligne, "statut": "rejeté",
                            "motif": "PERNR en doublon", "detail": pernr})
            continue
        seen.add(pernr)

        manager_pernr = _get(row, "people manager")
        if manager_pernr and manager_pernr not in all_known:
            report.append({"feuille": "people", "ligne": ligne, "statut": "rejeté",
                            "motif": "PERNR manager introuvable (ligne orpheline)",
                            "detail": f"manager={manager_pernr}"})
            continue

        statut = _get(row, "status")
        if statut not in KNOWN_EMPLOYEE_STATUSES:
            report.append({"feuille": "people", "ligne": ligne, "statut": "rejeté",
                            "motif": "Statut inconnu", "detail": statut})
            continue

        report.append({
            "feuille": "people", "ligne": ligne, "statut": "accepté", "detail": f"PERNR {pernr}",
            "pernr": pernr, "nom": _get(row, "name"), "manager_pernr": manager_pernr or None,
            "statut_employe": statut, "grade": _get(row, "grade") or None,
        })
    return report


def validate_projects(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    report: list[dict] = []
    for i, row in enumerate(rows):
        ligne = i + 2
        code = _get(row, "code")

        if not code:
            report.append({"feuille": "projects", "ligne": ligne, "statut": "rejeté",
                            "motif": "Code projet manquant", "detail": str(row)})
            continue
        if code in seen:
            report.append({"feuille": "projects", "ligne": ligne, "statut": "rejeté",
                            "motif": "Code projet en doublon", "detail": code})
            continue
        seen.add(code)

        statut_norm = normalize_project_status(_get(row, "status"))
        if statut_norm is None:
            report.append({"feuille": "projects", "ligne": ligne, "statut": "rejeté",
                            "motif": "Statut projet inconnu", "detail": _get(row, "status")})
            continue

        report.append({
            "feuille": "projects", "ligne": ligne, "statut": "accepté", "detail": code,
            "code": code, "nom": _get(row, "name"), "client": _get(row, "client"),
            "statut_projet": statut_norm,
        })
    return report


def process_mapping(mapping_rows: list[dict], people_by_name: dict[str, list[str]]) -> list[dict]:
    """
    Résout la feuille `mapping` (jointure par nom exact — fragile, cf. §2 point 3).
    `people_by_name` : nom -> liste des PERNR portant ce nom (déjà importés depuis `people`).

    Renvoie une liste de rapports ; les lignes résolues portent en plus (pernr, department,
    direction, role) pour que le routeur mette à jour department.lead_pernr/lead_titre ou
    direction.head_pernr selon le rôle.
    """
    report: list[dict] = []
    for i, row in enumerate(mapping_rows):
        ligne = i + 2
        name = _get(row, "name")
        department = _get(row, "department")
        direction = _get(row, "direction")
        role = _get(row, "role")

        candidates = people_by_name.get(name, [])
        if not candidates:
            report.append({"feuille": "mapping", "ligne": ligne, "statut": "rejeté",
                            "motif": "Collaborateur introuvable", "detail": name})
            continue
        if len(candidates) > 1:
            report.append({"feuille": "mapping", "ligne": ligne, "statut": "rejeté",
                            "motif": "Nom ambigu — plusieurs collaborateurs portent ce nom",
                            "detail": name})
            continue

        report.append({
            "feuille": "mapping", "ligne": ligne, "statut": "accepté", "detail": name,
            "pernr": candidates[0], "department": department, "direction": direction, "role": role,
        })
    return report


def resolve_hierarchy(employees: dict[str, dict]) -> int:
    """
    Propage department_id/direction_id des leads/Heads (déjà posés par `process_mapping`)
    vers le reste de la hiérarchie, en remontant `manager_pernr` jusqu'à trouver un
    collaborateur déjà rattaché à un département. Mutating : modifie `employees` en place.

    `employees` : pernr -> {"manager_pernr": str|None, "department_id": str|None,
    "direction_id": str|None}.

    Renvoie le nombre d'employés restés sans département résolu (chaîne qui ne remonte à
    aucun lead mappé, ou cycle) — ce n'est pas un rejet de ligne (la validation PERNR/statut
    a déjà eu lieu), juste un compteur informatif pour l'historique d'import.
    """
    unresolved = 0

    def resolve(pernr: str, visited: set[str]) -> tuple[str | None, str | None]:
        emp = employees.get(pernr)
        if emp is None:
            return None, None
        if emp["department_id"] is not None:
            return emp["department_id"], emp["direction_id"]
        if pernr in visited:
            return None, None  # cycle
        manager_pernr = emp.get("manager_pernr")
        if not manager_pernr:
            return None, None  # racine non mappée
        visited.add(pernr)
        dep, dirn = resolve(manager_pernr, visited)
        if dep is not None:
            emp["department_id"] = dep
            emp["direction_id"] = dirn
        return dep, dirn

    for pernr in list(employees.keys()):
        dep, _ = resolve(pernr, set())
        if dep is None and employees[pernr]["department_id"] is None:
            unresolved += 1
    return unresolved
