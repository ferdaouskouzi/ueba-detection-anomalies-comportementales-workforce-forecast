import os
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
TOTP_STEP_TOKEN_EXPIRE_MINUTES = int(os.getenv("TOTP_STEP_TOKEN_EXPIRE_MINUTES", "5"))
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./workforce.db")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]

# Nombre de tentatives de connexion échouées avant verrouillage temporaire du compte
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
