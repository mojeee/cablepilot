<!--
Italian text of the demo page (/it/demo/), translated from docs/demo.md: same "## N." sections.
"source" is the hash the build prints when docs/demo.md changes; update it together with the translation.
source: 852def186e
-->
# Demo: disegna una volta, gli elenchi e il set di disegni seguono

Una dimostrazione di CablePilot con il caricabatterie DC di esempio, circa un minuto e mezzo. È la stessa
storia del video sul sito, e tutto ciò che mostra funziona nella versione attuale: nessun mock-up. Il video
è registrato dall’app reale da uno script (`e2e/demo.e2e.ts`), così viene rifatto ogni volta che
l’interfaccia cambia: `npm run record:demo`.

## 1. Apri l’esempio, la copertina e il set di disegni

Scegli **Progetti di esempio > Caricabatterie 110 V DC**. Il progetto si apre sulla copertina: l’indice dei
fogli con la revisione di ogni foglio in una matrice delle revisioni, lo stato di emissione e il blocco di
approvazione del cliente. Fai clic sulle pagine del navigatore: indice, schema unifilare e la pagina di
interfaccia PLC con la sua scheda I/O. Sono le pagine del set con cui l’officina costruisce e il cliente
approva, tutte nella cornice e nel cartiglio del progetto.

- I progetti di esempio sono inclusi nel programma, così ogni funzione si mostra senza file propri.
- Le pagine sono disegnate nella lingua di disegno del progetto (qui l’italiano), qualunque sia la lingua dell’interfaccia.

## 2. Una bobina e un contatto dalla libreria

Nella pagina dei relè di allarme scrivi `coil` nella ricerca dei simboli e inserisci una bobina. Riceve da
sola la sua designazione. Poi inserisci un contatto normalmente aperto e dagli la stessa designazione: il
contatto entra nel dispositivo della bobina e i riferimenti incrociati compaiono su entrambi. Assegna un
articolo generico al dispositivo nel pannello Proprietà.

- La designazione segue la IEC 81346 (=funzione +luogo -prodotto).
- Nulla viene scritto due volte: il dispositivo, i suoi due simboli e il suo articolo sono una sola voce in ogni elenco.

## 3. Numeri filo e gli elenchi che seguono

Apri **Fili**, imposta il primo numero a 20 e fai clic su **Numera i fili ora**: i fili sono numerati con lo
schema `{n:3}{suffix}` (020L+, 021L+ e così via) in un solo passo di annullamento. Poi apri **Report**:
l’elenco fili mostra i nuovi numeri e la distinta materiali conta già il contattore appena inserito. Tutti gli
elenchi nascono dallo schema e si aggiornano con lui.

- La tabella delle classi di filo dell’azienda si modifica nella finestra Fili; i numeri scritti a mano restano.
- Gli stessi elenchi si possono aggiungere al set di disegni come pagine.

## 4. Il banner dei controlli trova un problema; un clic lo corregge

Disegna un filo che non collega nulla. Il banner degli avvisi compare subito con la segnalazione, la sua regola
e la sua norma. Fai clic sulla correzione: il filo isolato viene rimosso, il banner sparisce e tutto è un solo
passo di annullamento.

- Il controllo delle regole elettriche è continuo; le segnalazioni compaiono anche come marcatori sulla pagina.
- **Correggi tutto il correggibile** applica ogni correzione semplice in un solo passo.

## 5. Panoramica I/O del PLC ed elenco dei simboli

Apri **I/O PLC**: ogni canale delle schede PLC con indirizzo, simbolo, commento, a cosa è collegato e dove è
disegnato, in tempo reale dallo schema. Modifica un simbolo qui e la scheda nella pagina PLC lo mostra;
modificalo sulla scheda e cambia qui. **Esporta** scrive l’elenco dei simboli per CODESYS (una lista di
variabili globali) o per TIA Portal (XML, segnato come non verificato finché non è controllato sulla
documentazione Siemens).

- Gli indirizzi seguono uno schema configurabile (notazione Siemens o IEC 61131-3, primo byte di ogni area).
- L’importazione di un elenco di simboli ha prima un’anteprima e si applica in un solo passo di annullamento.

## 6. PDF e XLSX

**Esporta PDF** scrive il set di disegni completo (vettoriale, testo incorporato) e **Esporta tutti gli
elenchi in XLSX** scrive ogni elenco, compreso l’elenco I/O del PLC, in un’unica cartella di lavoro. Il video
finisce sulla copertina.

- I file sono tuoi: formato di progetto aperto, PDF e XLSX in uscita, nessun account.
