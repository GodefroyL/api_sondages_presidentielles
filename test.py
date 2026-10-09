import datetime


# foncrtion pour comparer la date du sondage avec la date d'aujourd'hui et savoir si le sondage est récent ou pas
def sondage_recent(date_sondage: str) -> bool:
    """
    Fonction pour savoir si le sondage est récent ou pas
    Un sondage est considéré comme récent si sa date est inférieure à 3 mois par rapport à la date d'aujourd'hui
    """
    date = datetime.datetime.now().date()
    date_sondage = date_sondage.split("/")
    date_sondage = datetime.datetime(int(date_sondage[2]), int(date_sondage[1]), int(date_sondage[0])).date()
    difference = date - date_sondage
    print(difference.days)
    if difference.days <= 90:
        return True
    return False

print(sondage_recent("01/09/2026"))
