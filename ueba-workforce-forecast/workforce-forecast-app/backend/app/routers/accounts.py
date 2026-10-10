"""
Gestion des comptes applicatifs par l'Administrateur (cahier des charges §2.2) : liste et
réinitialisation de mot de passe. Périmètre strict — seuls les comptes EUM/EUD et Head of
Direction sont exposés ici, jamais le référentiel employé complet (voir models.py::AppUser)
ni un autre compte ADMIN (§4.1 : un admin ne réinitialise pas un autre admin par ce canal).
"""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_roles
from ..models import AppUser, Role
from ..routers.auth import _audit, _client_ip
from ..schemas import AccountOut, AdminResetPasswordOut
from ..security import generate_strong_password, hash_password

router = APIRouter(prefix="/admin/accounts", tags=["accounts"])

_MANAGED_ROLES = (Role.EUM_EUD, Role.HEAD_OF_DIRECTION)


def _account_out(user: AppUser) -> AccountOut:
    locked = bool(user.locked_until and user.locked_until > dt.datetime.utcnow())
    return AccountOut(
        id=user.id, pernr=user.pernr, nom=user.nom, role=user.role.value,
        direction_id=user.direction_id, department_id=user.department_id,
        is_active=user.is_active, locked=locked, must_change_password=user.must_change_password,
    )


def _get_managed_account(db: Session, pernr: str) -> AppUser:
    """Un compte géré par cette page : EUM/EUD ou Head of Direction, jamais un ADMIN — même
    404 générique que le compte n'existe pas ou soit hors périmètre, pour ne rien laisser
    deviner d'un identifiant ADMIN par le comportement de la réponse."""
    user = db.query(AppUser).filter(AppUser.pernr == pernr).first()
    if user is None or user.role not in _MANAGED_ROLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compte introuvable")
    return user


@router.get("", response_model=list[AccountOut])
def list_accounts(db: Session = Depends(get_db), _admin: AppUser = Depends(require_roles("ADMIN"))):
    users = db.query(AppUser).filter(AppUser.role.in_(_MANAGED_ROLES)).order_by(AppUser.nom).all()
    return [_account_out(u) for u in users]


@router.post("/{pernr}/reset-password", response_model=AdminResetPasswordOut)
def reset_password(
    pernr: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: AppUser = Depends(require_roles("ADMIN")),
):
    """Génère un mot de passe temporaire, invalide l'ancien immédiatement (remplacement du
    hash), force le changement au prochain login, et lève le verrou éventuel — un admin qui
    réinitialise un compte verrouillé doit le débloquer, pas seulement changer son mot de
    passe. Journalisé (qui=admin, cible=compte, quand) — jamais le mot de passe en clair."""
    target = _get_managed_account(db, pernr)

    temporary_password = generate_strong_password()
    target.password_hash = hash_password(temporary_password)
    target.must_change_password = True
    target.failed_attempts = 0
    target.locked_until = None
    db.commit()

    _audit(
        db, admin.pernr, "PASSWORD_RESET_BY_ADMIN", f"cible={target.pernr}", _client_ip(request),
        target_pernrs=[target.pernr],
    )

    return AdminResetPasswordOut(temporary_password=temporary_password)
