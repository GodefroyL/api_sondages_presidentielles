function charger_donnees() {
    const donnees = fetch('https://api-sondages-presidentielles.fastapicloud.dev/premier_tour/2027');
    return donnees;
}

function main() {
    donnees = charger_donnees();
    const div = document.getElementById("test");
    div.innerHTML = donnees;
}

main()