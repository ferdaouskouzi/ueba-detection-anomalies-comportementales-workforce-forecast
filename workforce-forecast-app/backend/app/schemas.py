from typing import Literal, Optional
import datetime as dt
from pydantic import BaseModel, field_validator


class LoginRequest(BaseModel):
    pernr: str
    password: str

    @field_validator("pernr")
    @classmethod
    def pernr_as_string(cls, v: str) -> str:
        # Le PERNR doit toujours être traité comme une chaîne (zéros de tête significatifs)
        return str(v).strip()


class LoginStepResponse(BaseModel):
    needs_totp_setup: bool
    temp_token: str
    otpauth_uri: Optional[str] = None
    qr_code_base64: Optional[str] = None  # image PNG encodée base64, à afficher telle quelle


class TotpVerifyRequest(BaseModel):
    temp_token: str
    code: str
    # Rôle sélectionné sur l'écran de départ (tuile "Administrateur" / "Lead" / "Head of
    # Direction") — comparé au rôle réel du compte APRÈS authentification complète (mot de
    # passe + TOTP) et AVANT l'émission du token (défense en profondeur : le contrôle client
    # existe déjà, celui-ci garantit le rejet même s'il est contourné ou modifié).
    expected_role: Literal["EUM_EUD", "HEAD_OF_DIRECTION", "ADMIN"]


class UserOut(BaseModel):
    id: int
    pernr: str
    nom: str
    role: str
    direction_id: Optional[str] = None
    department_id: Optional[str] = None
    must_change_password: bool
    # Uniquement pertinent pour un EUM_EUD (None sinon) — référentiel importé pour son
    # département ? Voir app/readiness.py, seul point de vérité de cette règle.
    department_ready: Optional[bool] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AccountOut(BaseModel):
    """Compte applicatif géré par l'Administrateur (cahier des charges §2.2) — EUM/EUD et
    Head of Direction uniquement, jamais le référentiel employé complet, jamais un autre
    compte ADMIN. Le statut est dérivé (is_active / locked_until), pas un champ stocké."""
    id: int
    pernr: str
    nom: str
    role: str
    direction_id: Optional[str] = None
    department_id: Optional[str] = None
    is_active: bool
    locked: bool
    must_change_password: bool

    class Config:
        from_attributes = True


class AdminResetPasswordOut(BaseModel):
    # Affiché une seule fois côté client, jamais renvoyé ni journalisé en clair ensuite.
    temporary_password: str


class DirectionOut(BaseModel):
    id: str
    nom: str
    head_pernr: Optional[str] = None

    class Config:
        from_attributes = True


class DepartmentOut(BaseModel):
    id: str
    nom: str
    direction_id: str
    lead_pernr: str
    lead_titre: str

    class Config:
        from_attributes = True


class EmployeeOut(BaseModel):
    pernr: str
    nom: str
    manager_pernr: Optional[str] = None
    statut: str
    grade: Optional[str] = None
    direction_id: Optional[str] = None
    department_id: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectOut(BaseModel):
    code: str
    nom: str
    client: str
    statut: str

    class Config:
        from_attributes = True


class ActivityCodeOut(BaseModel):
    code: str
    libelle: str
    famille: str
    projet_obligatoire: bool
    couleur: str

    class Config:
        from_attributes = True


class ImportReportRow(BaseModel):
    feuille: str  # "people" | "mapping" | "projects"
    ligne: int
    statut: str  # "accepté" | "rejeté"
    motif: Optional[str] = None
    detail: str


class DepartmentImportSummary(BaseModel):
    """Photo de l'état d'un département après un import — cahier des charges §3.3 : l'admin doit
    savoir combien de collaborateurs sont rattachés et si c'est prêt pour les leads concernés."""
    department_id: str
    department_nom: str
    collaborateurs: int
    pret: bool  # voir app/readiness.py::department_is_ready


class ImportReport(BaseModel):
    kind: str  # "employees" | "projects"
    total_lignes: int
    acceptees: int
    rejetees: int
    rapport: list[ImportReportRow]
    # Snapshot de tous les départements (pas seulement ceux touchés par ce fichier) : un import
    # de projets change la disponibilité de tous les départements d'un coup (portée globale).
    par_departement: list[DepartmentImportSummary] = []


class ForecastEntryOut(BaseModel):
    pernr: str
    date: str
    demi_journee: str
    code: str
    project_code: Optional[str] = None
    auteur: str
    horodatage: dt.datetime

    class Config:
        from_attributes = True


class ForecastPaintUpdate(BaseModel):
    pernr: str
    date: str
    demi: Literal["AM", "PM"]


class ForecastPaintRequest(BaseModel):
    updates: list[ForecastPaintUpdate]
    code: str  # code d'activité, ou "__erase" pour effacer
    project_code: Optional[str] = None


class ForecastPaintResponse(BaseModel):
    updated: list[ForecastEntryOut]
    deleted: list[ForecastPaintUpdate]


class ForecastAuditEntryOut(BaseModel):
    """Une écriture de la grille de prévision (AuditLog.action == "FORECAST_PAINT"),
    reconstruite en réponse structurée à partir du champ `detail` — voir
    routers/audit.py pour le format d'origine et le parsing."""
    quand: dt.datetime   # AuditLog.quand
    qui: str             # AuditLog.qui — PERNR de l'auteur de la saisie
    pernr: str            # collaborateur dont le créneau a été peint
    date: str             # jour ISO du créneau (yyyy-mm-dd)
    demi: str             # "AM" | "PM"
    avant: str            # état du créneau avant la saisie ("—" si vide)
    apres: str            # état après ("—" si vide ; "— (effacement)" pour un effacement)


class ImportHistoryOut(BaseModel):
    id: int
    kind: str
    filename: str
    imported_at: dt.datetime
    imported_by_pernr: str
    lignes_acceptees: int
    lignes_rejetees: int

    class Config:
        from_attributes = True
