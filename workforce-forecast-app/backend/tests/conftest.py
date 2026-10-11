"""
Infrastructure de test commune : base SQLite isolée en mémoire (une par test, jamais la vraie
workforce.db de dev), client HTTP FastAPI branché dessus via dependency override de get_db, et
petits helpers pour créer des comptes/tokens/fichiers .xlsx sans passer par les endpoints qui
n'existent pas encore (création de compte, notamment — seul seed.py le fait aujourd'hui).
"""
import io

import openpyxl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import AppUser
from app.security import create_access_token, generate_totp_secret, hash_password


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def make_user(db_session, *, pernr, nom, role, direction_id=None, department_id=None) -> AppUser:
    """Compte applicatif déjà pleinement actif (mot de passe défini, 2FA confirmée) — le flux
    de login/TOTP lui-même est déjà couvert manuellement, ces tests portent sur autre chose."""
    user = AppUser(
        pernr=pernr, nom=nom, role=role,
        direction_id=direction_id, department_id=department_id,
        password_hash=hash_password("Test-Password-123!"),
        must_change_password=False,
        totp_secret=generate_totp_secret(),
        totp_confirmed=True,
    )
    db_session.add(user)
    db_session.flush()
    return user


def auth_headers(user: AppUser) -> dict:
    token = create_access_token(user.id, user.role.value)
    return {"Authorization": f"Bearer {token}"}


def make_xlsx(sheets: dict[str, list[dict]]) -> bytes:
    """sheets = {nom_feuille: [{colonne: valeur, ...}, ...]} -> contenu .xlsx en mémoire,
    au même format que ceux attendus par routers/reference_data.py::_read_sheet."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        if not rows:
            continue
        headers = list(rows[0].keys())
        ws.append(headers)
        for row in rows:
            ws.append([row.get(h) for h in headers])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
