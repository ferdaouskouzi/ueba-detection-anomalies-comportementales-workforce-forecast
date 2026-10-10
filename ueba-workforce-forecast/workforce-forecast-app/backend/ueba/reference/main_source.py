"""
API UEBA — endpoint /score
============================
Reçoit UNE action (un lead qui consulte des fiches un jour donné)
et retourne si c'est jugé normal ou suspect par le modèle.

Lancer avec : uvicorn main:app --reload
Puis ouvrir : http://127.0.0.1:8000/docs  (interface de test automatique)
"""

from collections import defaultdict, deque
from datetime import date
import json

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import pandas as pd
import joblib

app = FastAPI(title="UEBA Score API")

FENETRE_GLISSANTE_JOURS = 7
# Seuil de la règle hybride (voir entrainement_v2_5signaux.py, section 6) :
# une action est aussi marquée suspecte si novelty_zscore dépasse ce seuil,
# indépendamment du verdict d'Isolation Forest.
SEUIL_NOVELTY_HYBRIDE = 2

# On charge le modèle et la baseline UNE SEULE FOIS au démarrage de l'API
# (pas à chaque requête, ce serait trop lent)
modele = joblib.load("modele_isolation_forest.joblib")
baseline = pd.read_csv("baseline_par_lead.csv", sep=";")
baseline = baseline.set_index("pernr_lead")

# Historique des consultations en mémoire, pour calculer score_nouveaute :
# pernr_lead (int) -> deque de {"date": str, "pernrs": set[str]}, sur au plus
# 7 jours. Amorcé au démarrage avec historique_consultations.json (les 7
# derniers jours du dataset d'entraînement), puis mis à jour à chaque /score.
#
# ATTENTION — LIMITE CONNUE : cet historique vit uniquement en mémoire du
# process. Il est PERDU à chaque redémarrage de l'API (nouveau déploiement,
# crash, restart uvicorn...), ce qui fait retomber score_nouveaute à 0 pour
# les leads tant qu'ils n'ont pas de nouvelles actions scorées. Piste
# d'amélioration pour la suite : persister cet historique dans un fichier
# (ex: réécrire historique_consultations.json) ou une vraie base de données
# au lieu de la mémoire du process.
HISTORIQUE: dict[int, deque] = defaultdict(lambda: deque(maxlen=FENETRE_GLISSANTE_JOURS))

try:
    with open("historique_consultations.json", encoding="utf-8") as f:
        historique_initial = json.load(f)
    for pernr_lead_str, jours in historique_initial.items():
        d = HISTORIQUE[int(pernr_lead_str)]
        for jour in jours:
            d.append({"date": jour["date"], "pernrs": set(jour["pernrs"])})
except FileNotFoundError:
    pass  # pas d'historique de départ : score_nouveaute vaudra 0 jusqu'aux premières actions

templates = Jinja2Templates(directory="templates")


# Ce que l'API attend en entrée : une action à évaluer.
# Pydantic vérifie automatiquement que les types sont corrects
# (ex: refuse si nb_fiches_consultees n'est pas un nombre).
class ActionAEvaluer(BaseModel):
    pernr_lead: int
    heure_connexion: float
    nb_fiches_consultees: int
    hors_departement: bool
    duree_minutes: float
    pernrs_consultes: list[str] = []


class LeadInconnuError(Exception):
    """Levée quand le pernr_lead n'a pas de baseline calculée."""


def calculer_score_nouveaute(pernr_lead, pernrs_consultes) -> float:
    """Proportion de pernrs_consultes qui n'apparaissent pas dans l'historique
    en mémoire de ce lead (jusqu'à 7 jours). Ne modifie PAS l'historique
    (lecture seule) — voir mettre_a_jour_historique pour l'écriture."""
    consultes_aujourdhui = set(pernrs_consultes) if pernrs_consultes else set()
    if not consultes_aujourdhui:
        return 0.0

    deja_vus = set()
    for jour in HISTORIQUE.get(pernr_lead, ()):
        deja_vus |= jour["pernrs"]

    if not deja_vus:
        # Aucun historique pour ce lead : pas de référence, donc pas de signal
        # (même convention qu'à l'entraînement, voir calculer_novelty_zscore.py).
        return 0.0

    nouveaux = consultes_aujourdhui - deja_vus
    return len(nouveaux) / len(consultes_aujourdhui)


def mettre_a_jour_historique(pernr_lead, pernrs_consultes) -> None:
    """À appeler APRÈS avoir scoré une action, pour que les prochains calculs
    de score_nouveaute de ce lead en tiennent compte."""
    consultes_aujourdhui = set(pernrs_consultes) if pernrs_consultes else set()
    if not consultes_aujourdhui:
        return

    aujourdhui = date.today().isoformat()
    d = HISTORIQUE[pernr_lead]
    if d and d[-1]["date"] == aujourdhui:
        d[-1]["pernrs"] |= consultes_aujourdhui
    else:
        d.append({"date": aujourdhui, "pernrs": set(consultes_aujourdhui)})


def evaluer_action(pernr_lead, heure_connexion, nb_fiches_consultees, hors_departement, duree_minutes,
                    pernrs_consultes=None) -> dict:
    # 1) Vérifier qu'on connaît ce lead (sinon on ne peut pas calculer sa baseline)
    if pernr_lead not in baseline.index:
        raise LeadInconnuError(f"Lead {pernr_lead} inconnu dans la baseline.")

    b = baseline.loc[pernr_lead]
    vitesse = nb_fiches_consultees / max(duree_minutes, 0.1)

    # 2) Calculer les 5 signaux (même logique que pour l'entraînement)
    volume_zscore = (nb_fiches_consultees - b["moyenne_volume"]) / max(b["ecart_type_volume"], 0.001)
    heure_zscore = (heure_connexion - b["moyenne_heure"]) / max(b["ecart_type_heure"], 0.001)
    vitesse_zscore = (vitesse - b["moyenne_vitesse"]) / max(b["ecart_type_vitesse"], 0.001)
    hors_departement_num = 1 if hors_departement else 0

    score_nouveaute = calculer_score_nouveaute(pernr_lead, pernrs_consultes)
    novelty_zscore = (score_nouveaute - b["moyenne_nouveaute"]) / max(b["ecart_type_nouveaute"], 0.001)

    features = pd.DataFrame(
        [[volume_zscore, heure_zscore, vitesse_zscore, hors_departement_num, novelty_zscore]],
        columns=["volume_zscore", "heure_zscore", "vitesse_zscore", "hors_departement_num", "novelty_zscore"],
    )

    # 3) Demander au modèle : normal ou anormal ?
    prediction = modele.predict(features)[0]  # -1 = anormal, 1 = normal
    score_brut = modele.decision_function(features)[0]  # plus c'est négatif, plus c'est suspect

    # 4) RÈGLE HYBRIDE (voir entrainement_v2_5signaux.py, section 6) : élargir
    # le seuil d'Isolation Forest pour attraper les anomalies "discrètes"
    # coûte cher en fausses alertes. Une règle indépendante et ciblée sur
    # novelty_zscore obtient un meilleur recall avec beaucoup moins de bruit
    # (20/20 anomalies, 40 fausses alertes contre 180 pour un seuil élargi
    # équivalent). On combine donc : suspect si le modèle le dit, OU si
    # novelty_zscore dépasse ce seuil, même si le modèle ne le voit pas.
    modele_suspect = bool(prediction == -1)
    novelty_suspect = bool(novelty_zscore > SEUIL_NOVELTY_HYBRIDE)
    est_suspect = modele_suspect or novelty_suspect

    raisons = []
    if modele_suspect:
        raisons.append("modele_isolation_forest")
    if novelty_suspect:
        raisons.append("nouveaute_cible")

    return {
        "pernr_lead": pernr_lead,
        "est_suspect": est_suspect,
        "raison_alerte": ",".join(raisons) if raisons else None,
        "score_confiance": round(float(score_brut), 3),
        "signaux_calcules": {
            "volume_zscore": round(volume_zscore, 2),
            "heure_zscore": round(heure_zscore, 2),
            "vitesse_zscore": round(vitesse_zscore, 2),
            "hors_departement": hors_departement,
            "score_nouveaute": round(score_nouveaute, 3),
            "novelty_zscore": round(novelty_zscore, 2),
        }
    }


@app.post("/score")
def calculer_score(action: ActionAEvaluer):
    try:
        resultat = evaluer_action(
            pernr_lead=action.pernr_lead,
            heure_connexion=action.heure_connexion,
            nb_fiches_consultees=action.nb_fiches_consultees,
            hors_departement=action.hors_departement,
            duree_minutes=action.duree_minutes,
            pernrs_consultes=action.pernrs_consultes,
        )
    except LeadInconnuError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # On ne met à jour l'historique qu'une fois l'action effectivement scorée
    # (une requête sur un lead inconnu, elle, ne doit rien faire persister).
    mettre_a_jour_historique(action.pernr_lead, action.pernrs_consultes)
    return resultat


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    dataset = pd.read_csv("ueba_dataset_workforce_forecast.csv", sep=";")

    lignes = []
    for _, row in dataset.iterrows():
        try:
            resultat = evaluer_action(
                pernr_lead=int(row["pernr_lead"]),
                heure_connexion=float(row["heure_connexion"]),
                nb_fiches_consultees=int(row["nb_fiches_consultees"]),
                hors_departement=bool(row["hors_departement"]),
                duree_minutes=float(row["duree_minutes"]),
            )
        except LeadInconnuError:
            continue

        lignes.append({
            "nom": row["nom"],
            "departement": row["departement"],
            "date": row["date"],
            "heure_connexion": row["heure_connexion"],
            "nb_fiches_consultees": row["nb_fiches_consultees"],
            "hors_departement": bool(row["hors_departement"]),
            "score_confiance": resultat["score_confiance"],
            "statut": "Suspect" if resultat["est_suspect"] else "Normal",
            "est_suspect": resultat["est_suspect"],
            "raison_alerte": resultat["raison_alerte"],
        })

    # Actions suspectes en premier (tri stable : conserve l'ordre du CSV entre elles)
    lignes.sort(key=lambda l: l["est_suspect"], reverse=True)
    nb_suspectes = sum(1 for l in lignes if l["est_suspect"])

    return templates.TemplateResponse(request, "dashboard.html", {
        "lignes": lignes,
        "nb_suspectes": nb_suspectes,
        "nb_total": len(lignes),
    })


@app.get("/")
def accueil():
    return {"message": "API UEBA active. Va sur /docs pour tester."}