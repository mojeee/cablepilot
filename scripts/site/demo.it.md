<!--
Italian text of the demo page (/it/demo/), translated from docs/demo.md: same "## N." sections.
"source" is the hash the build prints when docs/demo.md changes; update it together with the translation.
source: d9f4977933
-->
# Demo: disegna una volta, gli elenchi e il set di disegni seguono

Una dimostrazione di CablePilot con il caricabatterie DC e il nastro trasportatore di esempio, meno di due minuti. È la stessa
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
elenchi in XLSX** scrive ogni elenco, compreso l’elenco I/O del PLC, in un’unica cartella di lavoro.

- I file sono tuoi: formato di progetto aperto, PDF e XLSX in uscita, nessun account.

## 7. Dimensionamento dallo schema, articoli dal magazzino

Apri il campione del nastro trasportatore, apri **Magazzino** e carica la lista di magazzino di esempio (la tua
arriva da un’esportazione CSV o XLSX del sistema di magazzino, tramite un’associazione delle colonne salvata per
la tua azienda). Seleziona il motore nella pagina di potenza e porta la potenza nominale a 7,5 kW nel pannello
Proprietà: la corrente di impiego viene ricalcolata. **Dimensiona questa linea** elenca interruttore, contattore,
relè termico, cavo e fili trovati nello schema, ciascuno con il suo requisito. Il contattore non lo soddisfa più:
apri i suoi suggerimenti per vedere il requisito, le ipotesi e gli articoli che lo soddisfano, in ordine di
disponibilità a magazzino per questo progetto, con magazzino, ubicazione e quantità disponibile (giacenza, meno
il riservato, meno ciò che il progetto già usa). Seleziona l’articolo disponibile e conferma: la distinta mostra
il nuovo articolo con giacenza e quantità disponibile.

- Il dimensionamento è calcolato dai dati del progetto e dichiara le sue ipotesi; i valori di tabella non ancora
  verificati sulla norma sono segnalati e nessun risultato sostituisce la verifica del progettista.
- Confermare una riga è un solo passo di annullamento, e **Accetta tutte le proposte** lo è per l’intero progetto.

## 8. Il layout del quadro

Apri la pagina di layout del nastro trasportatore di esempio (la vista frontale della piastra di montaggio, in scala),
cancellala e fai clic su **Suggerisci layout** nella scheda Layout. Il suggerimento è un’anteprima: armadio e piastra
dimensionati con la percentuale di spazio di riserva dell’azienda, guide DIN, canaline e ogni componente della distinta
alla sua misura reale (potenza in alto, comando sotto, morsetti vicino all’ingresso cavi, componenti in porta nella pagina
della porta). Il pannello dell’assistente elenca le regole applicate e la fonte di ciascuna. **Accetta** lo mette nelle
pagine di layout, poi lo modifichi con i normali strumenti: trascina un componente e si aggancia alla sua guida. Apri
**Vista 3D** e ruota il quadro con il mouse.

- Gli elementi che sposti o blocchi restano dove sono quando suggerisci di nuovo; il resto si sistema intorno.
- Il layout dà anche una vista laterale con le profondità dei componenti, il riempimento delle canaline, le lunghezze dei
  fili stimate lungo le canaline e un DXF di foratura della piastra, e si scambia con l’ERP in JSON, CSV e DXF.

## 9. L’area di lavoro CAD e l’assistente

In una pagina del nastro trasportatore di esempio, fai clic sulla riga di comando e scrivi `L`, premi Invio, poi scrivi `30,40` e `@60,0`
(Invio dopo ciascuno) e ancora Invio: la linea viene disegnata da coordinate scritte. Scrivi di nuovo `L` e avvicina il
cursore all’estremità di quella linea: si aggancia e la barra di stato nomina lo snap (snap a oggetto, F3). Poi apri
**Impostazioni IA**, incolla una chiave API e salvala (la registrazione usa una chiave di prova e il sostituto scriptato, quindi
nulla lascia il computer; con la tua chiave un modello usa gli stessi strumenti). Nella chat scrivi «aggiungi un avviatore
stella-triangolo per un motore da 7,5 kW a pagina 5»: l’assistente legge la pagina, cerca nella libreria, dimensiona la
partenza con il motore di dimensionamento e l’elenco di magazzino, e risponde con un’anteprima evidenziata (il circuito
dell’avviatore su una nuova pagina di potenza, perché la pagina 5 è piena) e una fonte per ogni affermazione (questo
progetto, una norma e il suo punto, una voce di libreria, oppure «suggerimento» con le sue ipotesi). **Accetta** lo inserisce
in un solo passo di annullamento; **Ctrl+Z** lo toglie di nuovo.

- La barra multifunzione, la riga di comando (alias come `L`, `PL`, `REC`, `M`, `CO`, `TR`, `Z`), gli ausili nella barra di stato
  (griglia F7, orto F8, snap F9, snap a oggetto F3, polare F10), i livelli e i pannelli ancorabili sono tutti nell’app.
- Senza chiave la chat usa l’assistente integrato, che capisce poche richieste e dice che le richieste libere richiedono una
  chiave API; l’app è pienamente utilizzabile anche senza.

Il video finisce sulla copertina del campione del nastro trasportatore.
