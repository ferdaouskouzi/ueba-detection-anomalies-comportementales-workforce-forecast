"""
Migration : ajoute à `audit_log` les 2 colonnes du module UEBA et crée la table
`ueba_score`.

SQLite n'applique PAS d'ALTER via Base.metadata.create_all sur une table qui
existe déjà — il faut donc un ALTER TABLE explicite pour une base workforce.db
déjà en service. create_all, lui, crée bien les tables absentes (ueba_score).

Idempotent : réexécutable sans risque (colonnes ajoutées seulement si absentes).
Fait une sauvegarde `<db>.bak-before-ueba` au passage (convention .bak-before-*
déjà utilisée dans backend/).

Usage (depuis backend/) :
    ./venv/Scripts/python.exe -m ueba.migration_audit_columns
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from sqlalchemy import inspect, text

from app.config import DATABASE_URL
from app.database import Base, engine
import app.models  # noqa: F401 — enregistre AuditLog / UebaScore sur Base.metadata

_COLONNES = {
    "target_pernrs": "TEXT",
    "perimetre": "BOOLEAN",
}


def _chemin_sqlite() -> Path | None:
    if not DATABASE_URL.startswith("sqlite"):
        return None
    brut = DATABASE_URL.split("sqlite:///", 1)[-1]
    if brut in ("", ":memory:"):
        return None
    p = Path(brut)
    if not p.is_absolute():
        p = (Path.cwd() / p).resolve()
    return p


def _sauvegarder() -> None:
    p = _chemin_sqlite()
    if p is None or not p.exists():
        print("Base non-fichier ou absente : pas de sauvegarde.")
        return
    dest = p.with_name(p.name + ".bak-before-ueba")
    if dest.exists():
        print(f"Sauvegarde déjà présente : {dest.name}")
        return
    shutil.copy2(p, dest)
    print(f"Sauvegarde : {dest.name}")


def migrer() -> None:
    _sauvegarder()

    inspecteur = inspect(engine)
    tables = inspecteur.get_table_names()

    if "audit_log" in tables:
        existantes = {c["name"] for c in inspecteur.get_columns("audit_log")}
        with engine.begin() as conn:
            for nom, sql_type in _COLONNES.items():
                if nom in existantes:
                    print(f"audit_log.{nom} : déjà présente.")
                    continue
                conn.execute(text(f"ALTER TABLE audit_log ADD COLUMN {nom} {sql_type}"))
                print(f"audit_log.{nom} : ajoutée ({sql_type}).")
    else:
        print("audit_log absente : sera créée par create_all ci-dessous.")

    # Crée les tables manquantes (ueba_score, et audit_log si base neuve).
    Base.metadata.create_all(bind=engine)

    inspecteur = inspect(engine)
    apres = {c["name"] for c in inspecteur.get_columns("audit_log")}
    manquantes = set(_COLONNES) - apres
    if manquantes:
        print(f"ÉCHEC : colonnes toujours absentes : {manquantes}", file=sys.stderr)
        sys.exit(1)
    print(f"OK — audit_log: {sorted(apres)}")
    print(f"OK — ueba_score {'présente' if 'ueba_score' in inspecteur.get_table_names() else 'ABSENTE'}")


if __name__ == "__main__":
    migrer()
