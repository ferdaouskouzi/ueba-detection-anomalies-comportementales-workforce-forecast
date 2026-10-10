"""
Cahier des charges §2.4 : "Cette règle est implémentée par calcul et jamais par table codée
en dur ; elle est couverte par un test unitaire sur au moins trois années consécutives."
§7.1 (critère d'acceptation) : "Le lundi de la semaine 1 est calculé correctement pour 2025,
2026 et 2027 (test unitaire)."

_iso_week1_monday() (backend/app/seed.py) est une implémentation Python indépendante de
isoWeek1Monday() côté frontend (src/utils/isoWeek.ts) — même règle ISO 8601 (le lundi de la
semaine contenant le 4 janvier / le premier jeudi de l'année), mais deux calculs séparés,
donc deux suites de tests séparées. Dates de référence vérifiées indépendamment de
l'implémentation (jours de semaine du 1er janvier de chaque année) :
- 2025 : 1er janvier = mercredi -> lundi de semaine 1 = 30/12/2024
- 2026 : 1er janvier = jeudi (déjà dans la semaine 1) -> lundi de semaine 1 = 29/12/2025
- 2027 : 1er janvier = vendredi -> lundi de semaine 1 = 04/01/2027 (le 4 janvier est déjà un lundi)
"""
from app.seed import _iso_week1_monday


def test_iso_week1_monday_2025():
    assert _iso_week1_monday(2025).isoformat() == "2024-12-30"


def test_iso_week1_monday_2026():
    # Exemple donné explicitement par le CDC.
    assert _iso_week1_monday(2026).isoformat() == "2025-12-29"


def test_iso_week1_monday_2027():
    assert _iso_week1_monday(2027).isoformat() == "2027-01-04"
