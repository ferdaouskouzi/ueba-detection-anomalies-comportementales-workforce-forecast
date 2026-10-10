from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .database import Base, engine, SessionLocal
from .routers import accounts, audit, auth, reference_data, forecast
from .seed import seed_activity_codes
from ueba.router import router as ueba_router

Base.metadata.create_all(bind=engine)

with SessionLocal() as _db:
    seed_activity_codes(_db)

app = FastAPI(
    title="Workforce Forecast — API d'authentification",
    version="1.0.0",
    description="Backend d'authentification réel (PERNR + Argon2id + TOTP obligatoire) "
                 "conforme au cahier des charges §4.1, en attendant le branchement SSO Entra ID.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(reference_data.router)
app.include_router(forecast.router)
app.include_router(audit.router)
app.include_router(ueba_router)


@app.get("/health")
def health():
    return {"status": "ok"}
