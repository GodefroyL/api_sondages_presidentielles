from fastapi import FastAPI

from sources import lecture_page_sondage

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Bienvenue sur l'API des sondages du premier tour de l'élection présidentielle."}

@app.get("/premier_tour/{annee}")
def get_sondages_premer_tour(annee: str):
    """
    Endpoint pour récupérer les sondages du premier tour de l'élection présidentielle.
    """
    if annee not in ["2017", "2022", "2027"]: return {"error": "Année invalide. Veuillez utiliser 2017, 2022 ou 2027."}
    else: return lecture_page_sondage.main(annee)

@app.get("/second_tour/{annee}")
def get_sondages_second_tour(annee: str):
    """
    Endpoint pour récupérer les sondages du second tour de l'élection présidentielle.
    """
    return {"message": f"Récupération des sondages du second tour n'est pas encore implémentée."}

app.frontend("/accueil", directory="frontend/nouveau_site")

if __name__ == "__main__":
    sondages = get_sondages_premer_tour("2027")
    print(sondages)
