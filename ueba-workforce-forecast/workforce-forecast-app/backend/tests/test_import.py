"""
Tests des fonctions pures de validation/résolution d'import (backend/app/import_logic.py) —
un cas accepté et un cas rejeté par règle listée dans INSTRUCTIONS_REFERENTIELS_BACKEND.md §4.
"""
from app.import_logic import (
    validate_employees, validate_projects, process_mapping, resolve_hierarchy,
    normalize_project_status,
)


# ---- validate_employees --------------------------------------------------

def test_employee_accepted():
    rows = [{"pernr": "00100001", "name": "Hamza Benali", "people manager": None, "status": "Active", "grade": "G7"}]
    report = validate_employees(rows, known_pernrs=set())
    assert report[0]["statut"] == "accepté"
    assert report[0]["pernr"] == "00100001"
    assert report[0]["manager_pernr"] is None


def test_employee_missing_pernr_rejected():
    rows = [{"pernr": "", "name": "Sans Pernr", "people manager": None, "status": "Active"}]
    report = validate_employees(rows, known_pernrs=set())
    assert report[0]["statut"] == "rejeté"
    assert report[0]["motif"] == "PERNR manquant"


def test_employee_duplicate_pernr_rejected():
    rows = [
        {"pernr": "1", "name": "A", "people manager": None, "status": "Active"},
        {"pernr": "1", "name": "B", "people manager": None, "status": "Active"},
    ]
    report = validate_employees(rows, known_pernrs=set())
    assert report[1]["statut"] == "rejeté"
    assert report[1]["motif"] == "PERNR en doublon"


def test_employee_orphan_manager_rejected():
    rows = [{"pernr": "1", "name": "A", "people manager": "999999", "status": "Active"}]
    report = validate_employees(rows, known_pernrs=set())
    assert report[0]["statut"] == "rejeté"
    assert report[0]["motif"] == "PERNR manager introuvable (ligne orpheline)"


def test_employee_manager_found_in_db_accepted():
    rows = [{"pernr": "2", "name": "A", "people manager": "1", "status": "Active"}]
    report = validate_employees(rows, known_pernrs={"1"})
    assert report[0]["statut"] == "accepté"


def test_employee_unknown_status_rejected():
    rows = [{"pernr": "1", "name": "A", "people manager": None, "status": "OnLeaveForever"}]
    report = validate_employees(rows, known_pernrs=set())
    assert report[0]["statut"] == "rejeté"
    assert report[0]["motif"] == "Statut inconnu"


def test_employee_inactive_status_accepted():
    rows = [{"pernr": "1", "name": "A", "people manager": None, "status": "Inactive"}]
    report = validate_employees(rows, known_pernrs=set())
    assert report[0]["statut"] == "accepté"


# ---- validate_projects ----------------------------------------------------

def test_project_accepted_and_status_normalized():
    rows = [{"code": "PRJ0001", "name": "Wayne Ent.", "client": "Umbrella", "status": "active"}]
    report = validate_projects(rows)
    assert report[0]["statut"] == "accepté"
    assert report[0]["statut_projet"] == "actif"


def test_project_missing_code_rejected():
    rows = [{"code": "", "name": "X", "client": "Y", "status": "active"}]
    report = validate_projects(rows)
    assert report[0]["statut"] == "rejeté"
    assert report[0]["motif"] == "Code projet manquant"


def test_project_duplicate_code_rejected():
    rows = [
        {"code": "P1", "name": "X", "client": "Y", "status": "active"},
        {"code": "P1", "name": "Z", "client": "Y", "status": "active"},
    ]
    report = validate_projects(rows)
    assert report[1]["statut"] == "rejeté"
    assert report[1]["motif"] == "Code projet en doublon"


def test_project_unknown_status_rejected():
    rows = [{"code": "P1", "name": "X", "client": "Y", "status": "en pause"}]
    report = validate_projects(rows)
    assert report[0]["statut"] == "rejeté"
    assert report[0]["motif"] == "Statut projet inconnu"


def test_normalize_project_status_closed_synonyms():
    assert normalize_project_status("closed") == "clôturé"
    assert normalize_project_status("Active") == "actif"
    assert normalize_project_status("banana") is None


# ---- process_mapping --------------------------------------------------

def test_mapping_resolved():
    rows = [{"name": "Hind Tazi", "department": "ML", "direction": "Engineering", "role": "EUM"}]
    report = process_mapping(rows, people_by_name={"Hind Tazi": ["00100005"]})
    assert report[0]["statut"] == "accepté"
    assert report[0]["pernr"] == "00100005"


def test_mapping_not_found_rejected():
    rows = [{"name": "Inconnu Untel", "department": "ML", "direction": "Engineering", "role": "EUM"}]
    report = process_mapping(rows, people_by_name={})
    assert report[0]["statut"] == "rejeté"
    assert report[0]["motif"] == "Collaborateur introuvable"


def test_mapping_ambiguous_name_rejected():
    rows = [{"name": "Jean Dupont", "department": "ML", "direction": "Engineering", "role": "EUM"}]
    report = process_mapping(rows, people_by_name={"Jean Dupont": ["1", "2"]})
    assert report[0]["statut"] == "rejeté"
    assert "ambigu" in report[0]["motif"].lower()


# ---- resolve_hierarchy -----------------------------------------------

def test_resolve_hierarchy_propagates_down_the_chain():
    employees = {
        "LEAD": {"manager_pernr": None, "department_id": "DEP1", "direction_id": "D1"},
        "N1": {"manager_pernr": "LEAD", "department_id": None, "direction_id": None},
        "LEAF": {"manager_pernr": "N1", "department_id": None, "direction_id": None},
    }
    unresolved = resolve_hierarchy(employees)
    assert unresolved == 0
    assert employees["N1"]["department_id"] == "DEP1"
    assert employees["LEAF"]["department_id"] == "DEP1"


def test_resolve_hierarchy_unmapped_root_stays_unresolved():
    employees = {
        "ORPHAN_ROOT": {"manager_pernr": None, "department_id": None, "direction_id": None},
        "CHILD": {"manager_pernr": "ORPHAN_ROOT", "department_id": None, "direction_id": None},
    }
    unresolved = resolve_hierarchy(employees)
    assert unresolved == 2
    assert employees["CHILD"]["department_id"] is None


def test_resolve_hierarchy_cycle_does_not_hang():
    employees = {
        "A": {"manager_pernr": "B", "department_id": None, "direction_id": None},
        "B": {"manager_pernr": "A", "department_id": None, "direction_id": None},
    }
    unresolved = resolve_hierarchy(employees)
    assert unresolved == 2
