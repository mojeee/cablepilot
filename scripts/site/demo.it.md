<!--
Italian text of the demo page (/it/demo/), translated from docs/demo.md: same "## N." sections.
"source" is the hash the build prints when docs/demo.md changes; update it together with the translation.
source: 4a3d308922
-->
# Demo: disegna una volta, gli elenchi e il set di disegni seguono

Una dimostrazione di CablePilot con il caricabatterie DC di esempio, circa un minuto e mezzo. È la stessa
storia del video sul sito, e tutto ciò che mostra funziona nella versione attuale: nessun mock-up. Il video
è registrato dall’app reale da uno script (`e2e/demo.e2e.ts`), così viene rifatto ogni volta che
l’interfaccia cambia: `npm run record:demo`.

## 1. Apri l’esempio e sfoglia il set di disegni

Scegli **Progetti di esempio > Caricabatterie 110 V DC**. Il progetto si apre sulla copertina. Fai clic sulle
pagine del navigatore: indice, schema unifilare, pagina multifilare di potenza, interfaccia PLC, schema delle
morsettiere, elenco fili e distinta materiali. Sono le pagine del set con cui l’officina costruisce e il
cliente approva, tutte nella cornice e nel cartiglio del progetto.

- I progetti di esempio sono inclusi nel programma, così ogni funzione si mostra senza file propri.
- Le pagine sono disegnate nella lingua di disegno del progetto (qui l’italiano), qualunque sia la lingua dell’interfaccia.

## 2. Una bobina e un contatto dalla libreria

Nella pagina dei relè di allarme scrivi `coil` nella ricerca dei simboli e inserisci una bobina. Riceve da
sola la sua designazione. Poi inserisci un contatto normalmente aperto e dagli la stessa designazione: il
contatto entra nel dispositivo della bobina e i riferimenti incrociati compaiono su entrambi. Assegna un
articolo generico al dispositivo nel pannello Proprietà.

- La designazione segue la IEC 81346 (=funzione +luogo -prodotto).
- Nulla viene scritto due volte: il dispositivo, i suoi due simboli e il suo articolo sono una sola voce in ogni elenco.

## 3. Numeri filo, colori e un fascio

Apri **Fili**, imposta il primo numero a 20 e fai clic su **Numera i fili ora**: i fili sono numerati con lo
schema `{n:3}{suffix}` (020L+, 021L+ e così via) in un solo passo di annullamento. I conduttori sono
disegnati nel colore della loro classe (sigle IEC 60757) e un filo segnato come fascio mostra una sola
etichetta con sezione e colore al posto del numero.

- La tabella delle classi di filo dell’azienda si modifica nella stessa finestra.
- I fili di una stessa rete, e le reti unite tra pagine, hanno un solo numero. I numeri scritti a mano restano.

## 4. Elenchi che seguono lo schema

Apri **Report**: lo schema delle morsettiere, l’elenco fili con i nuovi numeri e la distinta materiali, che
conta già il contattore appena inserito. Tutti gli elenchi nascono dallo schema e si aggiornano con lui.

- Gli stessi elenchi si possono aggiungere al set di disegni come pagine.

## 5. Anteprima di stampa, PDF e XLSX

Attiva **Anteprima di stampa (bianca)** per vedere la pagina come viene stampata. Poi **Esporta PDF** scrive
il set di disegni completo (vettoriale, testo incorporato) e **Esporta tutti gli elenchi in XLSX** scrive ogni
elenco in un’unica cartella di lavoro. Il video finisce sulla copertina.

- I file sono tuoi: formato di progetto aperto, PDF e XLSX in uscita, nessun account.
