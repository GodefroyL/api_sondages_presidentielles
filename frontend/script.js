


async function recupererSondages() {
    try {
        const reponse = await fetch("/api/sondages");
        if (!reponse.ok) {
            throw new Error(`Erreur HTTP : ${reponse.status}`);
        }
        const donnees = await reponse.json();
        return donnees;
    } catch (erreur) {
        console.error("Échec de la récupération des sondages :", erreur);
        // afficher un message d'erreur à l'utilisateur si besoin
    }
}