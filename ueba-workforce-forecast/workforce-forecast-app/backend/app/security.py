import base64
import datetime as dt
import io
import secrets
from typing import Optional

import jwt
import pyotp
import qrcode
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHash

from .config import JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, TOTP_STEP_TOKEN_EXPIRE_MINUTES

# --- Mots de passe : Argon2id (paramètres recommandés OWASP) ---
_ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, hash_len=32, salt_len=16)


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        _ph.verify(hashed, plain)
        return True
    except (VerifyMismatchError, InvalidHash):
        return False


# --- Politique de robustesse des mots de passe (NIST SP 800-63B rév. 4 + complexité) ---
PASSWORD_MIN_LENGTH = 12


def password_policy_errors(password: str) -> list[str]:
    """Retourne la liste des exigences non satisfaites (vide si le mot de passe est conforme).
    Seul point de vérité de la politique : appelé par toute route qui définit un mot de passe."""
    errors = []
    if len(password) < PASSWORD_MIN_LENGTH:
        errors.append(f"au moins {PASSWORD_MIN_LENGTH} caractères")
    if not any(c.islower() for c in password):
        errors.append("une minuscule")
    if not any(c.isupper() for c in password):
        errors.append("une majuscule")
    if not any(c.isdigit() for c in password):
        errors.append("un chiffre")
    if not any(not c.isalnum() for c in password):
        errors.append("un symbole (ex. ! @ # $ %)")
    return errors


# Alphabet sans caractères ambigus (0/O, 1/l/I) pour rester lisible si retranscrit à la main
_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*"


def generate_strong_password(length: int = 16) -> str:
    """Mot de passe aléatoire cryptographiquement sûr (secrets.choice, pas random).
    Utilisé à la création des comptes (seed.py) et par la réinitialisation admin
    (routers/accounts.py) — un seul générateur, jamais reconstitué ailleurs."""
    while True:
        pwd = "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))
        # Garantit au moins une minuscule, une majuscule, un chiffre et un symbole
        if (any(c.islower() for c in pwd) and any(c.isupper() for c in pwd)
                and any(c.isdigit() for c in pwd) and any(c in "!@#$%&*" for c in pwd)):
            return pwd


# --- JWT ---
def _create_token(sub: str, scope: str, minutes: int, extra: Optional[dict] = None) -> str:
    now = dt.datetime.utcnow()
    payload = {
        "sub": sub,
        "scope": scope,  # "totp_pending" (étape 1) ou "access" (session complète)
        "iat": now,
        "exp": now + dt.timedelta(minutes=minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_temp_totp_token(user_id: int) -> str:
    return _create_token(str(user_id), "totp_pending", TOTP_STEP_TOKEN_EXPIRE_MINUTES)


def create_access_token(user_id: int, role: str) -> str:
    return _create_token(str(user_id), "access", ACCESS_TOKEN_EXPIRE_MINUTES, {"role": role})


def decode_token(token: str) -> dict:
    # Lève jwt.ExpiredSignatureError / jwt.InvalidTokenError si invalide — géré par l'appelant
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


# --- TOTP (2FA obligatoire, cahier des charges §4.1) ---
def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, pernr: str, issuer: str = "Workforce Forecast — Capgemini Engineering") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=pernr, issuer_name=issuer)


def totp_qr_base64(otpauth_uri: str) -> str:
    img = qrcode.make(otpauth_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def verify_totp_code(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)
