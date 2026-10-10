"""
Détermine si le référentiel d'un département a été importé (cahier des charges §2.3, §3.3).

Point de vérité unique, réutilisé à la fois pour bloquer l'écriture de forecast tant qu'aucun
import n'a eu lieu (routers/forecast.py) et pour que l'écran d'import admin confirme qu'un
département est prêt pour ses leads (routers/reference_data.py) — jamais recalculé deux fois.
"""
from sqlalchemy.orm import Session

from .models import Employee, Project


def department_is_ready(db: Session, department_id: str | None) -> bool:
    """Un département est « prêt » pour la saisie de forecast si au moins un collaborateur lui
    est rattaché et qu'au moins un projet actif existe dans le référentiel (les projets ne sont
    pas eux-mêmes rattachés à un département : leur portée est globale)."""
    if not department_id:
        return False
    has_employee = db.query(Employee.pernr).filter(Employee.department_id == department_id).first() is not None
    if not has_employee:
        return False
    has_active_project = db.query(Project.code).filter(Project.statut == "actif").first() is not None
    return has_active_project
