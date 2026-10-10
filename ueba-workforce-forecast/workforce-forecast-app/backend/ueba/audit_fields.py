"""
Lecture / écriture des deux colonnes UEBA de `audit_log` (target_pernrs, perimetre)
et repli sur les lignes historiques laissées à NULL par la migration.

Point de vérité unique pour :
  - sérialiser une liste de PERNR dans la colonne TEXT `target_pernrs` (JSON) ;
  - la relire de façon tolérante (JSON, ou CSV, ou NULL) ;
  - retrouver un volume de consultation approché sur une ligne ancienne, en
    parsant le `lignes=N` que log_read_access écrit déjà dans `detail`.
"""
from __future__ import annotations

import json
import re

_LIGNES_RE = re.compile(r"lignes=(\d+)")


def dump_target_pernrs(pernrs) -> str | None:
    """Liste de PERNR -> chaîne JSON pour la colonne `target_pernrs`.
    Renvoie None si la liste est vide (événement sans dimension nominative)."""
    if not pernrs:
        return None
    # PERNR = toujours du texte (zéros de tête), on dédoublonne en gardant l'ordre trié
    nettoyes = sorted({str(p) for p in pernrs if p is not None and str(p) != ""})
    return json.dumps(nettoyes, ensure_ascii=False) if nettoyes else None


def load_target_pernrs(valeur) -> list[str]:
    """Colonne `target_pernrs` -> liste de PERNR. Tolère JSON, CSV et NULL."""
    if not valeur:
        return []
    if isinstance(valeur, (list, tuple)):
        return [str(p) for p in valeur]
    texte = str(valeur).strip()
    if not texte:
        return []
    try:
        charge = json.loads(texte)
        if isinstance(charge, list):
            return [str(p) for p in charge]
    except (json.JSONDecodeError, ValueError):
        pass
    return [p.strip() for p in texte.split(",") if p.strip()]


def volume_depuis_detail(detail) -> int:
    """Repli pour une ligne d'audit sans `target_pernrs` : nombre de lignes
    nominatives lues, extrait du `lignes=N` déjà présent dans `detail`. À défaut
    (ex. FORECAST_PAINT, qui ne l'écrit pas), on compte 1 accès."""
    if not detail:
        return 1
    m = _LIGNES_RE.search(str(detail))
    return int(m.group(1)) if m else 1
