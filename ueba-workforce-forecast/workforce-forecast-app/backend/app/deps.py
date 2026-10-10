import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from .database import get_db
from .models import AppUser
from .security import decode_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AppUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise")
    try:
        payload = decode_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée, merci de vous reconnecter")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide")

    if payload.get("scope") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide pour cette opération")

    user = db.query(AppUser).filter(AppUser.id == int(payload["sub"])).first()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte introuvable ou désactivé")
    return user


def require_roles(*roles: str):
    """
    Contrôle du périmètre rejoué côté serveur à chaque requête (cahier des charges §2.2 / §4.1) —
    jamais fait uniquement côté client.
    """
    def _dep(user: AppUser = Depends(get_current_user)) -> AppUser:
        if user.role.value not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès hors de votre périmètre")
        return user
    return _dep
