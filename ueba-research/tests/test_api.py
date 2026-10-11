from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_score_action_normale():
    payload = {
        "pernr_lead": 100002,
        "heure_connexion": 7.7,
        "nb_fiches_consultees": 48,
        "hors_departement": False,
        "duree_minutes": 41,
    }
    response = client.post("/score", json=payload)
    assert response.status_code == 200
    assert response.json()["est_suspect"] is False


def test_score_action_suspecte():
    payload = {
        "pernr_lead": 100002,
        "heure_connexion": 2.5,
        "nb_fiches_consultees": 250,
        "hors_departement": True,
        "duree_minutes": 5,
    }
    response = client.post("/score", json=payload)
    assert response.status_code == 200
    assert response.json()["est_suspect"] is True


def test_score_lead_inconnu():
    payload = {
        "pernr_lead": 999999,
        "heure_connexion": 9.4,
        "nb_fiches_consultees": 40,
        "hors_departement": False,
        "duree_minutes": 60,
    }
    response = client.post("/score", json=payload)
    assert response.status_code == 404


def test_score_donnees_invalides():
    payload = {
        "pernr_lead": 100002,
        "heure_connexion": 9.4,
        "nb_fiches_consultees": "beaucoup",
        "hors_departement": False,
        "duree_minutes": 60,
    }
    response = client.post("/score", json=payload)
    assert response.status_code == 422


def test_score_novelty_croissante():
    """Plusieurs requêtes successives sur le même lead, avec des pernrs_consultes
    de plus en plus éloignés de son historique : la dernière requête (tous
    nouveaux) doit montrer un novelty_zscore nettement plus élevé que la
    première, et un score_confiance plus négatif (plus suspect)."""
    base = {
        "pernr_lead": 100002,
        "heure_connexion": 7.7,
        "nb_fiches_consultees": 48,
        "hors_departement": False,
        "duree_minutes": 41,
    }

    # 1) proche du taux de nouveauté habituel du lead 100002 (quelques pernrs
    #    connus de son historique de départ, un seul nouveau)
    r1 = client.post("/score", json={**base, "pernrs_consultes": [
        "100009", "100039", "100046", "100075", "100081", "990101",
    ]})
    # 2) mélange à moitié nouveau
    r2 = client.post("/score", json={**base, "pernrs_consultes": [
        "100009", "100039", "100046", "990102", "990103", "990104",
    ]})
    # 3) tous nouveaux par rapport à l'historique ET aux deux requêtes précédentes
    r3 = client.post("/score", json={**base, "pernrs_consultes": [
        "990201", "990202", "990203", "990204", "990205",
    ]})

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 200

    novelty1 = r1.json()["signaux_calcules"]["novelty_zscore"]
    novelty2 = r2.json()["signaux_calcules"]["novelty_zscore"]
    novelty3 = r3.json()["signaux_calcules"]["novelty_zscore"]

    assert novelty1 < novelty2 < novelty3
    assert novelty3 > 3  # nettement au-dessus de la moyenne du lead

    score1 = r1.json()["score_confiance"]
    score2 = r2.json()["score_confiance"]
    score3 = r3.json()["score_confiance"]

    assert score1 > score2 > score3  # de plus en plus négatif = de plus en plus suspect


def test_score_novelty_seule_declenche_alerte():
    """Règle hybride : une action avec les 4 autres signaux parfaitement
    normaux mais un novelty_zscore élevé doit quand même être marquée
    suspecte, via la règle novelty_zscore > 2 indépendante du modèle."""
    payload = {
        "pernr_lead": 100002,
        "heure_connexion": 7.7,
        "nb_fiches_consultees": 48,
        "hors_departement": False,
        "duree_minutes": 41,
        "pernrs_consultes": ["990701", "990702", "990703", "990704", "990705"],
    }
    response = client.post("/score", json=payload)
    data = response.json()

    assert response.status_code == 200
    assert abs(data["signaux_calcules"]["volume_zscore"]) < 0.5
    assert abs(data["signaux_calcules"]["heure_zscore"]) < 0.5
    assert abs(data["signaux_calcules"]["vitesse_zscore"]) < 0.5
    assert data["signaux_calcules"]["hors_departement"] is False
    assert data["signaux_calcules"]["novelty_zscore"] > 2

    assert data["est_suspect"] is True
    assert "nouveaute_cible" in data["raison_alerte"]


def test_dashboard_accessible():
    response = client.get("/dashboard")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
