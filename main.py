from functools import lru_cache

import requests_cache
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from sources import lecture_page_sondage

# Configuration du cache pour les requêtes HTTP
requests_cache.install_cache('sondages_cache', backend='memory', expire_after=3600, allowable_methods=['GET'], max_size=100)

app = FastAPI(title="API Sondages Présidentielles", description="API pour récupérer les sondages du premier tour de l'élection présidentielle française.", version="1.0.0")

@app.get("/premier_tour/{annee}")
@lru_cache(maxsize=3)
def get_sondages_premer_tour(annee: str):
    """
    Endpoint pour récupérer les sondages du premier tour de l'élection présidentielle.
    """
    if annee not in ["2017", "2022", "2027"]: return {"error": "Année invalide. Veuillez utiliser 2017, 2022 ou 2027."}
    else: return lecture_page_sondage.main(annee)

@app.get("/second_tour/{annee}")
@lru_cache(maxsize=3)
def get_sondages_second_tour(annee: str):
    """
    Endpoint pour récupérer les sondages du second tour de l'élection présidentielle.
    """
    return {"message": "Récupération des sondages du second tour n'est pas encore implémentée."}

app.frontend("/", directory="frontend")
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
app.mount("/donnees", StaticFiles(directory="donnees"), name="donnees")

if __name__ == "__main__":
    sondages = get_sondages_premer_tour("2027")
    print(sondages)
