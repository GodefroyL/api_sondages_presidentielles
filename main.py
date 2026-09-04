from fastapi import FastAPI

from sources import lecture_page_sondage

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Bienvenue sur l'API des sondages du premier tour de l'élection présidentielle."}

@app.get("/sondages")
def get_sondages():
    """
    Endpoint pour récupérer les sondages du premier tour de l'élection présidentielle.
    """
    sondages = lecture_page_sondage.recuperer_sondages_premier_tour()
    return sondages

if __name__ == "__main__":
    sondages = get_sondages()
    print(sondages)
