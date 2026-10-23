import json
import requests

ELECTIONS = ['2022', '2027']


def main():
    for election in ELECTIONS:
        donnee_premier_tour = requests.get(f'https://sondages-presidentielle.dgl-application.fr/premier_tour/{election}').json()
        donnee_second_tour = requests.get(f'https://sondages-presidentielle.dgl-application.fr/second_tour/{election}').json()

        with open(f'donnee/{election}_premier_tour.json','w') as fichier: json.dump(donnee_premier_tour, fichier)
        with open(f'donnee/{election}_second_tour.json','w') as fichier: json.dump(donnee_second_tour, fichier)

if __name__=='__main__':
    main()
