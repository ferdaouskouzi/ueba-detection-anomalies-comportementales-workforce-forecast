import enum
import datetime as dt

from sqlalchemy import (
    Column, String, ForeignKey, Boolean, DateTime, Integer, Float, Enum, Text,
    UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import relationship

from .database import Base


class Role(str, enum.Enum):
    EUM_EUD = "EUM_EUD"
    HEAD_OF_DIRECTION = "HEAD_OF_DIRECTION"
    ADMIN = "ADMIN"


class Direction(Base):
    __tablename__ = "direction"
    id = Column(String, primary_key=True)
    nom = Column(String, nullable=False)
    head_pernr = Column(String, nullable=True)  # PERNR du Head of Direction (résolu via la feuille mapping)


class Department(Base):
    __tablename__ = "department"
    id = Column(String, primary_key=True)
    nom = Column(String, nullable=False)
    direction_id = Column(String, ForeignKey("direction.id"), nullable=False)
    # PERNR = toujours du texte, jamais un entier (préservation des zéros de tête)
    lead_pernr = Column(String, nullable=False)
    lead_titre = Column(String, nullable=False)  # EUM | EUD


class Employee(Base):
    __tablename__ = "employee"
    pernr = Column(String, primary_key=True)  # texte, jamais numérique
    nom = Column(String, nullable=False)
    manager_pernr = Column(String, ForeignKey("employee.pernr"), nullable=True)
    statut = Column(String, nullable=False, default="Active")  # Active | Unpaid Leave | Terminated | Inactive
    grade = Column(String, nullable=True)  # G1..G7 — hors cahier des charges, stocké pour usage futur, non exposé en UI
    # Nullable : seuls les leads EUM/EUD et Heads (feuille mapping) reçoivent directement une direction/département ;
    # les autres collaborateurs l'héritent par remontée de la hiérarchie manager_pernr (voir reference_data.py).
    direction_id = Column(String, ForeignKey("direction.id"), nullable=True)
    department_id = Column(String, ForeignKey("department.id"), nullable=True)


class Project(Base):
    __tablename__ = "project"
    code = Column(String, primary_key=True)
    nom = Column(String, nullable=False)
    client = Column(String, nullable=False)
    statut = Column(String, nullable=False)  # actif | clôturé (normalisé à l'import)


class ActivityCode(Base):
    __tablename__ = "activity_code"
    code = Column(String, primary_key=True)  # P, BP, HB, M, F, ALTS, ALTC, CP, EL, SS, MAT
    libelle = Column(String, nullable=False)
    famille = Column(String, nullable=False)  # Production | Bench | Management | Formation | Alternance | Absence
    projet_obligatoire = Column(Boolean, nullable=False)  # règle R1
    couleur = Column(String, nullable=False)


class ImportBatch(Base):
    """Traçabilité des imports — cahier des charges §3.2, table import_batch."""
    __tablename__ = "import_batch"
    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String, nullable=False)  # "employees" | "projects"
    filename = Column(String, nullable=False)
    imported_at = Column(DateTime, default=dt.datetime.utcnow)
    imported_by_pernr = Column(String, nullable=False)
    lignes_acceptees = Column(Integer, nullable=False)
    lignes_rejetees = Column(Integer, nullable=False)
    rapport_json = Column(Text, nullable=False)  # rapport détaillé, sérialisé


class AppUser(Base):
    """
    Compte applicatif — seuls les EUM/EUD, Head of Direction et Administrateur en ont un
    (cahier des charges §2.2 et §4.1). Authentification "à défaut du SSO Entra ID" :
    PERNR en identifiant, mot de passe haché Argon2id, 2FA TOTP obligatoire.
    """
    __tablename__ = "app_user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    pernr = Column(String, unique=True, nullable=False, index=True)  # identifiant de connexion, pas un secret
    nom = Column(String, nullable=False)
    role = Column(Enum(Role), nullable=False)
    direction_id = Column(String, ForeignKey("direction.id"), nullable=True)
    department_id = Column(String, ForeignKey("department.id"), nullable=True)

    password_hash = Column(String, nullable=False)
    must_change_password = Column(Boolean, nullable=False, default=True)

    totp_secret = Column(String, nullable=False)
    totp_confirmed = Column(Boolean, nullable=False, default=False)

    is_active = Column(Boolean, nullable=False, default=True)
    failed_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=dt.datetime.utcnow)


class ForecastEntry(Base):
    """
    Saisie du forecast à la demi-journée (cahier des charges §3.2, table forecast_entry).
    `pernr` n'est pas une ForeignKey vers employee.pernr : ça évite de bloquer une saisie
    existante si l'employé est ensuite retiré du référentiel lors d'un ré-import (statut
    Terminated, etc.) — l'appartenance est vérifiée à l'écriture (routers/forecast.py),
    pas portée par une contrainte d'intégrité référentielle stricte.
    """
    __tablename__ = "forecast_entry"
    id = Column(Integer, primary_key=True, autoincrement=True)
    pernr = Column(String, nullable=False, index=True)
    date = Column(String, nullable=False)  # ISO yyyy-mm-dd
    demi_journee = Column(String, nullable=False)  # AM | PM
    code = Column(String, nullable=False)
    project_code = Column(String, nullable=True)
    auteur = Column(String, nullable=False)
    horodatage = Column(DateTime, default=dt.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("pernr", "date", "demi_journee", name="uq_forecast_entry_slot"),
        # Règle de gestion R1 (cahier des charges §2.3) : le code projet est renseigné
        # si et seulement si le code d'activité vaut P — vérifié en base, pas seulement
        # côté interface.
        CheckConstraint(
            "(code = 'P' AND project_code IS NOT NULL) OR (code != 'P' AND project_code IS NULL)",
            name="ck_forecast_entry_r1",
        ),
    )


class AuditLog(Base):
    """Journal d'authentification — cahier des charges §3.2 (table audit_log) et §4.1/§4.3."""
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    qui = Column(String, nullable=False)          # PERNR ou "anonyme"
    action = Column(String, nullable=False)        # LOGIN_SUCCESS, LOGIN_FAIL, TOTP_SETUP, TOTP_FAIL, ACCOUNT_LOCKED, LOGOUT...
    detail = Column(Text, nullable=True)
    ip = Column(String, nullable=True)
    quand = Column(DateTime, default=dt.datetime.utcnow)

    # --- Colonnes ajoutées pour le module UEBA (backend/ueba/) -------------------
    # Alimentées aux points d'écriture existants (audit.log_read_access, FORECAST_PAINT,
    # auth._audit) ; la migration backend/ueba/migration_audit_columns.py les ajoute
    # à une base workforce.db déjà créée (SQLite ne fait pas d'ALTER via create_all).
    #
    # target_pernrs : liste JSON des PERNR de collaborateurs concernés par l'accès
    #   (PAS un identifiant unique — un accès en touche plusieurs). NULL pour les
    #   événements sans dimension nominative (login, TOTP...) et pour les lignes
    #   antérieures à la migration.
    target_pernrs = Column(Text, nullable=True)
    # perimetre : True si l'accès porte sur au moins un collaborateur hors du
    #   département du lecteur (← signal `hors_departement` du module UEBA source).
    #   NULL = non renseigné (événement non nominatif, ou ligne historique).
    perimetre = Column(Boolean, nullable=True)


class UebaScore(Base):
    """
    Résultat du scoring UEBA pour un agrégat (lead, jour), recalculé en tâche de
    fond (BackgroundTasks) à chaque nouvel événement AuditLog de lecture.

    Contrainte RGPD du projet : aucun artefact de scoring n'est persisté sur
    disque hors du schéma SQLite. Le module source écrivait baseline_par_lead.csv
    et historique_consultations.json ; ici la baseline et l'historique 7 jours
    sont recalculés à la volée depuis audit_log, et seul le verdict atterrit ici.
    """
    __tablename__ = "ueba_score"
    id = Column(Integer, primary_key=True, autoincrement=True)
    pernr_lead = Column(String, nullable=False, index=True)
    jour = Column(String, nullable=False)  # ISO yyyy-mm-dd (jour de l'agrégat, UTC)
    est_suspect = Column(Boolean, nullable=False)
    raison_alerte = Column(String, nullable=True)      # "modele_isolation_forest", "nouveaute_cible", combinés par ","
    score_confiance = Column(Float, nullable=False)    # decision_function : plus négatif = plus suspect
    signaux_json = Column(Text, nullable=False)        # signaux_calcules sérialisé (mêmes clés que l'API source)
    # True quand target_pernrs / perimetre manquent sur l'agrégat : le scoring
    # retombe alors sur les 3 signaux fiables (volume, horaire, vitesse), les 2
    # autres étant neutralisés à 0 — pas de valeur inventée.
    signaux_fiables_seulement = Column(Boolean, nullable=False, default=False)
    calcule_le = Column(DateTime, default=dt.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("pernr_lead", "jour", name="uq_ueba_score_lead_jour"),
    )
