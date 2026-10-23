import json
import requests
import subprocess

def main():
    donnee_premier_tour = requests.get(f'https://sondages-presidentielle.dgl-application.fr/premier_tour/2027').json()
    # donnee_second_tour = requests.get(f'https://sondages-presidentielle.dgl-application.fr/second_tour/2027').json()

    with open(f'donnees/2027_premier_tour.json','w') as fichier: json.dump(donnee_premier_tour, fichier)
    # with open(f'donnees/2027_second_tour.json','w') as fichier: json.dump(donnee_second_tour, fichier)

    subprocess.run(['git','add','--','donnees'],check=True)
    resultat = subprocess.run(["git", 'diff', '--cached', '--quiet', '--', 'donnees/2027_premier_tour.json'],check=False)
    if resultat.returncode==1:
        subprocess.run(['git','commit','-m','Mise à jour des données'],check=True)
        subprocess.run(['git','push'],check=True)
        print('Modifications envoyées')
    else: print('Aucune modification')

if __name__=='__main__':
    main()
