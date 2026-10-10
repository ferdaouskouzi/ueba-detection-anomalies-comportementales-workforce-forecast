import datetime as dt
import json

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..config import MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES, ACCESS_TOKEN_EXPIRE_MINUTES
from ..database import get_db
from ..deps import get_current_user
from ..models import AppUser, AuditLog, Role
from ..readiness import department_is_ready
from ..schemas import (
    LoginRequest, LoginStepResponse, TotpVerifyRequest, TokenResponse, UserOut,
    ChangePasswordRequest,
)
from ..security import (
    verify_password, hash_password, create_temp_totp_token, create_access_token,
    decode_token, totp_provisioning_uri, totp_qr_base64, verify_totp_code,
    password_policy_errors,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(db: Session, user: AppUser) -> UserOut:
    """UserOut enrichi de department_ready — même règle que le blocage serveur de la saisie
    de forecast (app/readiness.py), jamais recalculée différemment ici."""
    base = UserOut.model_validate(user)
    ready = department_is_ready(db, user.department_id) if user.role == Role.EUM_EUD else None
    return base.model_copy(update={"department_ready": ready})


def _audit(db: Session, qui: str, action: str, detail: str = "", ip: str = "",
           target_pernrs: list[str] | None = None, perimetre: bool | None = None):
    # Colonnes UEBA (voir backend/ueba/) : un événement d'authentification n'a ni
    # collaborateur consulté ni périmètre de lecture — elles restent donc NULL
    # ici, mais le point d'écriture est câblé pour rester cohérent avec les deux
    # autres (audit.log_read_access, FORECAST_PAINT).
    db.add(AuditLog(
        qui=qui, action=action, detail=detail, ip=ip,
        target_pernrs=json.dumps(sorted({str(p) for p in target_pernrs})) if target_pernrs else None,
        perimetre=perimetre,
    ))
    db.commit()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.post("/login", response_model=LoginStepResponse)
def login_step1(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Étape 1 : vérification PERNR + mot de passe (Argon2id).
    Ne renvoie jamais directement de session complète : un token temporaire à courte durée
    de vie (scope=totp_pending) est émis, la 2FA est obligatoire pour obtenir l'accès.
    """
    generic_error = "Identifiants invalides"  # message volontairement non spécifique (anti-énumération de comptes)
    ip = _client_ip(request)

    user = db.query(AppUser).filter(AppUser.pernr == payload.pernr).first()

    if user is None:
        _audit(db, payload.pernr, "LOGIN_FAIL", "PERNR inconnu", ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, generic_error)

    if not user.is_active:
        _audit(db, user.pernr, "LOGIN_FAIL", "Compte désactivé", ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, generic_error)

    if user.locked_until and user.locked_until > dt.datetime.utcnow():
        remaining = int((user.locked_until - dt.datetime.utcnow()).total_seconds() // 60) + 1
        _audit(db, user.pernr, "LOGIN_FAIL", "Compte verrouillé", ip)
        raise HTTPException(
            status.HTTP_423_LOCKED,
            f"Compte temporairement verrouillé suite à plusieurs échecs. Réessayez dans {remaining} min.",
        )

    if not verify_password(payload.password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = dt.datetime.utcnow() + dt.timedelta(minutes=LOCKOUT_MINUTES)
            _audit(db, user.pernr, "ACCOUNT_LOCKED", f"{MAX_FAILED_ATTEMPTS} échecs consécutifs", ip)
        db.commit()
        _audit(db, user.pernr, "LOGIN_FAIL", "Mot de passe incorrect", ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, generic_error)

    # Succès du mot de passe : reset du compteur d'échecs
    user.failed_attempts = 0
    user.locked_until = None
    db.commit()

    temp_token = create_temp_totp_token(user.id)

    if not user.totp_confirmed:
        # Premier login : on doit faire scanner le QR code et confirmer la 2FA avant tout accès
        uri = totp_provisioning_uri(user.totp_secret, user.pernr)
        _audit(db, user.pernr, "TOTP_SETUP_REQUIRED", "", ip)
        return LoginStepResponse(
            needs_totp_setup=True,
            temp_token=temp_token,
            otpauth_uri=uri,
            qr_code_base64=totp_qr_base64(uri),
        )

    return LoginStepResponse(needs_totp_setup=False, temp_token=temp_token)


@router.post("/verify-totp", response_model=TokenResponse)
def verify_totp(payload: TotpVerifyRequest, request: Request, db: Session = Depends(get_db)):
    """
    Étape 2 : vérification du code à 6 chiffres de l'application d'authentification.
    C'est seulement ici qu'un token de session complet (scope=access) est délivré.
    """
    ip = _client_ip(request)
    try:
        data = decode_token(payload.temp_token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session de connexion expirée, recommencez")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide")

    if data.get("scope") != "totp_pending":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide pour cette étape")

    user = db.query(AppUser).filter(AppUser.id == int(data["sub"])).first()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte introuvable ou désactivé")

    if not verify_totp_code(user.totp_secret, payload.code):
        _audit(db, user.pernr, "TOTP_FAIL", "", ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Code de vérification incorrect")

    if not user.totp_confirmed:
        user.totp_confirmed = True
        _audit(db, user.pernr, "TOTP_SETUP_CONFIRMED", "", ip)

    db.commit()

    # Défense en profondeur (cf. Login.tsx côté client) : le rôle réel du compte, connu
    # seulement après authentification complète, doit correspondre à l'écran de départ
    # choisi. Rejet explicite, aucun token émis — le contrôle client ne suffit pas à lui
    # seul, un frontend contourné ou modifié ne doit jamais pouvoir l'éviter.
    if user.role.value != payload.expected_role:
        _audit(db, user.pernr, "LOGIN_ROLE_MISMATCH", f"attendu={payload.expected_role} réel={user.role.value}", ip)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "role_mismatch")

    access_token = create_access_token(user.id, user.role.value)
    _audit(db, user.pernr, "LOGIN_SUCCESS", "", ip)

    return TokenResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_user_out(db, user),
    )


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: AppUser = Depends(get_current_user)):
    return _user_out(db, user)


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db), user: AppUser = Depends(get_current_user)):
    # JWT sans état : la déconnexion est actée côté client (suppression du token) + journalisée ici.
    _audit(db, user.pernr, "LOGOUT", "", _client_ip(request))
    return {"ok": True}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """
    Deux usages distincts partagent cette route, volontairement :
    1. Compléter un changement FORCÉ (must_change_password=True) — après un reset admin ou
       à la création du compte (seed.py). Ouvert à tout rôle : c'est ForcePasswordChange.tsx
       qui l'appelle, avant même l'accès à l'application.
    2. Un changement VOLONTAIRE, à tout moment, hors ce contexte forcé — réservé à l'ADMIN
       (ProfilePanel.tsx). EUM/EUD et Head of Direction n'ont plus cette option : seul un
       Administrateur contrôle désormais leur mot de passe (via /admin/accounts, routers/
       accounts.py). Un compte non-ADMIN qui a déjà satisfait must_change_password ne peut
       donc plus rappeler cette route de sa propre initiative.
    """
    if user.role != Role.ADMIN and not user.must_change_password:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Le changement de mot de passe volontaire n'est plus disponible pour ce rôle — "
            "seul un Administrateur peut réinitialiser ce compte.",
        )
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Mot de passe actuel incorrect")
    errors = password_policy_errors(payload.new_password)
    if errors:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Le nouveau mot de passe doit contenir : " + ", ".join(errors),
        )
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    _audit(db, user.pernr, "PASSWORD_CHANGED", "", _client_ip(request))
    return {"ok": True}
