"""
ÉTAPE 1 — Génération du dataset UEBA avec détail des collaborateurs consultés
================================================================================
NOTE IMPORTANTE : aucun script de génération n'existait dans ce dépôt (seul
employees_sample.xlsx et le CSV déjà généré étaient présents). Ce script est
donc une RÉ-ÉCRITURE COMPLÈTE, décidée avec l'utilisateur, qui régénère
ueba_dataset_workforce_forecast.csv depuis zéro — les valeurs de ce fichier
changent donc par rapport à la version précédente (nouveaux tirages
aléatoires), tout comme le modèle et la baseline qui en dépendent (voir
sauvegarder_modele.py, à ré-exécuter après ce script).

Ce que fait ce script, par lead et par jour ouvré :
  1) Chaque lead a un "pool" de collaborateurs (échantillon fixe, propre à ce
     lead) parmi lesquels il consulte des fiches RH. employees_sample.xlsx ne
     contient pas de département/direction : ces deux colonnes sont donc
     assignées de façon fixe par lead (dict DEPARTEMENTS ci-dessous).
  2) Jour normal : parmi les personnes consultées, 85% sont tirées parmi les
     "habitués" (déjà consultés dans les 7 jours glissants précédents), 15%
     sont "nouvelles" (jamais consultées dans ces 7 jours).
  3) Anomalie "classique" (15 des 20 injectées) : volume/heure/vitesse très
     éloignés de la normale du lead, hors_departement=True — comme dans
     l'ancien générateur.
  4) Anomalie "discrète" (5 des 20 injectées) : volume proche de la normale
     (ne déclenche PAS les 4 signaux existants), hors_departement=False, mais
     environ 80% des personnes consultées ce jour-là sont JAMAIS vues dans les
     7 jours glissants précédents — c'est ce que le nouveau signal
     novelty_zscore doit détecter.

Sorties :
  - ueba_dataset_workforce_forecast.csv : mêmes colonnes qu'avant (agrégats).
  - consultations_detail.csv : une ligne par consultation individuelle
    (pernr_lead, date, pernr_collaborateur_consulte). Le nombre de lignes
    pour un (lead, date) donné est égal à nb_fiches_consultees de ce jour-là.
"""

import numpy as np
import pandas as pd

RANDOM_SEED = 42
POOL_SIZE_PAR_LEAD = 200
FENETRE_GLISSANTE_JOURS = 7
NB_JOURS = 64
NB_ANOMALIES_TOTAL = 20
NB_ANOMALIES_DISCRETES = 5

# Les 27 leads du dataset original (managers G6/G7 actifs dans employees_sample.xlsx).
LEADS = [
    100001, 100002, 100006, 100010, 100015, 100022, 100026, 100031, 100032,
    100038, 100043, 100050, 100054, 100058, 100063, 100064, 100068, 100073,
    100080, 100084, 100091, 100092, 100098, 100102, 100109, 100115, 100119,
]

# employees_sample.xlsx ne contient ni département ni direction : on les fixe
# ici par lead (repris de l'organisation utilisée dans la version précédente
# du dataset, pour rester cohérent avec le reporting existant).
DEPARTEMENTS = {
    100001: ("ML", "Engineering"), 100002: ("ML", "Engineering"),
    100006: ("Mobile", "Engineering"), 100010: ("Platform 4", "Engineering"),
    100015: ("QA", "Engineering"), 100022: ("Analytics", "Engineering"),
    100026: ("QA 5", "Engineering"), 100031: ("Security", "Data & AI"),
    100032: ("Security", "Data & AI"), 100038: ("Integration", "Data & AI"),
    100043: ("QA", "Data & AI"), 100050: ("Networks", "Data & AI"),
    100054: ("Web 6", "Data & AI"), 100058: ("Cloud", "Data & AI"),
    100063: ("Analytics", "Delivery"), 100064: ("Analytics", "Delivery"),
    100068: ("Infra", "Delivery"), 100073: ("Cloud", "Delivery"),
    100080: ("Mobile", "Delivery"), 100084: ("Billing", "Delivery"),
    100091: ("Web", "Operations"), 100092: ("Web", "Operations"),
    100098: ("Integration", "Operations"), 100102: ("Analytics", "Operations"),
    100109: ("Growth", "Operations"), 100115: ("Billing", "Operations"),
    100119: ("Analytics 2", "Operations"),
}


def charger_employes():
    emp = pd.read_excel("../employees_sample.xlsx")
    emp["pernr"] = emp["pernr"].astype(int)
    return emp


def construire_pools(emp):
    """Un pool fixe de 200 collaborateurs par lead, tiré parmi les employés actifs
    de grades individuels (G1-G5), en excluant les 27 leads eux-mêmes."""
    candidats = emp[
        emp["status"].eq("Active")
        & emp["grade"].isin(["G1", "G2", "G3", "G4", "G5"])
        & ~emp["pernr"].isin(LEADS)
    ]["pernr"].to_numpy()

    pools = {}
    for lead in LEADS:
        rng = np.random.default_rng(lead)  # seed propre à chaque lead -> reproductible
        pools[lead] = rng.choice(candidats, size=POOL_SIZE_PAR_LEAD, replace=False)
    return pools


def tirer_anomalies():
    """Choisit 20 couples (lead, indice_jour) parmi ceux qui ont au moins 7 jours
    d'historique disponibles, puis désigne 5 d'entre eux comme "discrets"."""
    rng = np.random.default_rng(RANDOM_SEED)
    paires_eligibles = [
        (lead, jour) for lead in LEADS for jour in range(FENETRE_GLISSANTE_JOURS, NB_JOURS)
    ]
    indices = rng.choice(len(paires_eligibles), size=NB_ANOMALIES_TOTAL, replace=False)
    paires_choisies = [paires_eligibles[i] for i in indices]

    indices_discretes = set(rng.choice(NB_ANOMALIES_TOTAL, size=NB_ANOMALIES_DISCRETES, replace=False))

    anomalies = {}
    for i, paire in enumerate(paires_choisies):
        anomalies[paire] = "discrete" if i in indices_discretes else "classique"
    return anomalies


def generer():
    emp = charger_employes()
    noms = emp.set_index("pernr")["name"]
    pools = construire_pools(emp)
    anomalies = tirer_anomalies()
    dates = pd.bdate_range(start="2026-05-01", periods=NB_JOURS)

    lignes_dataset = []
    lignes_detail = []

    for lead in LEADS:
        departement, direction = DEPARTEMENTS[lead]
        nom = noms.loc[lead]
        pool = pools[lead]

        rng_params = np.random.default_rng(lead + 10_000)
        mu_volume = rng_params.uniform(20, 60)
        sigma_volume = mu_volume * rng_params.uniform(0.20, 0.35)
        mu_heure = rng_params.uniform(7.5, 9.5)
        sigma_heure = rng_params.uniform(0.3, 1.0)
        mu_duree = rng_params.uniform(45, 110)
        sigma_duree = mu_duree * rng_params.uniform(0.15, 0.30)

        rng_jour = np.random.default_rng(lead + 20_000)  # tirages jour par jour, un seul flux par lead
        historique = []  # liste de (date_str, set(pernrs)) sur les 7 derniers jours

        for jour_idx, date in enumerate(dates):
            date_str = date.strftime("%Y-%m-%d")
            habitues = set().union(*[s for (_, s) in historique]) if historique else set()

            genre = anomalies.get((lead, jour_idx))

            if genre == "classique":
                volume = mu_volume + rng_jour.uniform(4, 8) * sigma_volume
                heure = mu_heure + rng_jour.choice([-1, 1]) * rng_jour.uniform(4, 8) * sigma_heure
                duree = max(mu_duree - rng_jour.uniform(3, 6) * sigma_duree, 5.0)
                hors_departement = True
            elif genre == "discrete":
                # volume proche de la normale : NE DOIT PAS déclencher volume_zscore
                volume = mu_volume + rng_jour.uniform(-0.6, 0.6) * sigma_volume
                heure = mu_heure + rng_jour.uniform(-0.6, 0.6) * sigma_heure
                duree = mu_duree + rng_jour.uniform(-0.6, 0.6) * sigma_duree
                hors_departement = False
            else:
                volume = rng_jour.normal(mu_volume, sigma_volume)
                heure = rng_jour.normal(mu_heure, sigma_heure)
                duree = rng_jour.normal(mu_duree, sigma_duree)
                hors_departement = bool(rng_jour.random() < 0.04)  # bruit naturel

            nb_fiches = max(int(round(volume)), 1)
            heure = float(np.clip(heure, 6.0, 12.0))
            duree = float(max(duree, 5.0))

            # --- tirage des collaborateurs consultés ce jour-là ---
            liste_habitues = list(habitues)
            liste_nouveaux = [p for p in pool if p not in habitues]

            if not habitues:
                p_nouveau = 1.0  # tout premier jour d'historique : aucun habitué possible
            elif genre == "discrete":
                p_nouveau = 0.80
            else:
                p_nouveau = 0.15

            n_nouveaux = rng_jour.binomial(nb_fiches, p_nouveau)
            n_habitues = nb_fiches - n_nouveaux

            tirages = []
            if n_nouveaux > 0:
                source = liste_nouveaux if liste_nouveaux else pool
                tirages.extend(rng_jour.choice(source, size=n_nouveaux, replace=True).tolist())
            if n_habitues > 0:
                source = liste_habitues if liste_habitues else pool
                tirages.extend(rng_jour.choice(source, size=n_habitues, replace=True).tolist())

            consultes_aujourdhui = set(tirages)
            historique.append((date_str, consultes_aujourdhui))
            if len(historique) > FENETRE_GLISSANTE_JOURS:
                historique.pop(0)

            lignes_dataset.append({
                "pernr_lead": lead,
                "nom": nom,
                "departement": departement,
                "direction": direction,
                "date": date_str,
                "heure_connexion": round(heure, 2),
                "nb_fiches_consultees": nb_fiches,
                "hors_departement": hors_departement,
                "duree_minutes": round(duree, 1),
                "est_anomalie": genre is not None,
            })
            for pernr_collab in tirages:
                lignes_detail.append({
                    "pernr_lead": lead,
                    "date": date_str,
                    "pernr_collaborateur_consulte": int(pernr_collab),
                })

    df_dataset = pd.DataFrame(lignes_dataset)
    df_detail = pd.DataFrame(lignes_detail)
    return df_dataset, df_detail


if __name__ == "__main__":
    df_dataset, df_detail = generer()

    df_dataset.to_csv("ueba_dataset_workforce_forecast.csv", sep=";", index=False)
    df_detail.to_csv("consultations_detail.csv", sep=";", index=False)

    print(f"{len(df_dataset)} lignes générées dans ueba_dataset_workforce_forecast.csv "
          f"({df_dataset['pernr_lead'].nunique()} leads x {df_dataset['date'].nunique()} jours).")
    print(f"{len(df_detail)} lignes générées dans consultations_detail.csv.")
    print(f"Anomalies injectées : {df_dataset['est_anomalie'].sum()} "
          f"(dont 5 discrètes, hors_departement=False, volume proche de la normale).")
