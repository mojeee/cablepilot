<!--
Italian text of the guide /it/docs/file-format/, translated from docs/file-format.md.
"source" is the hash the build prints when the English file changes; update it together with the translation.
source: 790d5e7b93
-->
# Formato del file di progetto

Un progetto CablePilot è un unico file di testo UTF-8 chiamato `<nome>.cablepilot.json`. È JSON semplice e
documentato: puoi leggerlo, tenerlo in Git, confrontare due versioni riga per riga e scrivere i tuoi strumenti
intorno a esso. Nessun vincolo: gli stessi dati escono dall’app anche come PDF, DXF, CSV e XLSX.

- **Schema:** [`shared/schema/project.schema.json`](../shared/schema/project.schema.json) (JSON Schema). Ogni progetto
  di esempio è verificato con esso nei test.
- **Versione attuale del formato:** 7. La versione è il campo `version` all’inizio del file.

## Scrittura stabile, adatta ai confronti

Il file è scritto sempre nello stesso modo, così una modifica al disegno dà una piccola modifica al file:

- chiavi sempre nello stesso ordine, rientro di due spazi, un a capo alla fine;
- oggetti ed elenchi brevi su una riga (fino a 100 caratteri), quelli più lunghi espansi un elemento per riga;
- elenchi ordinati dove l’ordine non ha significato (dati dei dispositivi per designazione, cavi per designazione), e
  tenuti nell’ordine del disegno dove lo ha (pagine, elementi di una pagina);
- nessun orario né percorso specifico del computer dentro il progetto.

## Cosa contiene il file

| Campo | Contenuto |
|---|---|
| `format`, `version` | sempre `"cablepilot-project"`, e la versione del formato |
| `id`, `name` | l’identificativo del progetto (resta lo stesso per tutta la sua vita) e il suo nome |
| `settings` | lingua dei disegni, norma dei simboli (IEC 60617 o NFPA 79 / ANSI), stile di disegno, formato e modello predefiniti del foglio, formato dei riferimenti incrociati, impostazioni della distinta, numerazione, colori dei fili, metodo di posa, dati di alimentazione, indirizzamento PLC, valori predefiniti del layout del quadro |
| `properties` | dati del progetto stampati nel cartiglio e in copertina: cliente, prodotto, numeri d’ordine e di disegno, disegnato / controllato / approvato, data di emissione, revisione... |
| `assembly` | dati dell’assieme per i fogli dati (IEC 61439): tensioni nominali, Icw, grado IP... |
| `templates` | le cornici e i cartigli aziendali usati dal progetto, salvati in esso così si apre ovunque |
| `potentials` | i potenziali (L1, L2, L3, N, PE, L+, L-, 24 V DC, 0 V...) con i loro tipi |
| `pages` | le pagine, in ordine: tipo, titolo in ogni lingua, formato del foglio, modello, funzione e luogo predefiniti, e gli elementi della pagina |
| `assets` | immagini usate nelle pagine (loghi, foto), incorporate |
| `symbols`, `parts` | i simboli aziendali e gli articoli di libreria usati dal progetto, incorporati così il progetto si apre su un computer senza la tua libreria aziendale |
| `devices` | dati conservati accanto al disegno per ogni dispositivo: articoli e quantità, campi utente, assieme che lo contiene, dati di carico per il dimensionamento |
| `projectParts` | articoli senza designazione (piastra di montaggio, kit di cablaggio), solo in distinta |
| `wireClasses`, `wireTypes`, `cables` | la tabella aziendale delle classi di filo (funzione, colore, sezione, tipo, suffisso), i tipi di filo con nome e i cavi con i loro conduttori |
| `layers` | stato, colore e tipo di linea dei livelli |
| `issueStatus`, `revisions` | lo stato di emissione del set e ogni revisione emessa con la sua istantanea (pagine, dispositivi, fili e articoli), usata per l’indice delle revisioni e i confronti |

### Elementi di una pagina

Ogni elemento ha un `id`, un `kind` e i propri campi, in millimetri della pagina (origine in alto a sinistra, y verso
il basso):

`symbol` (simbolo di libreria, posizione, rotazione, specchiatura, designazione, luogo, testo di funzione, valore),
`box` (scatola nera o connettore con pin), `wire` (spezzata ortogonale, potenziale, numero, tipo di filo, cavo e
conduttore), `junction`, `text`, `line`, `rect`, `circle`, `table`, `image`, `warning` (segnale di avvertimento),
`form` (un foglio dati legato ai campi del progetto), `report` (un report dal vivo stampato sulla pagina) e `cab` (un
elemento del layout del quadro).

Report, riferimenti incrociati, distinta, morsettiere ed elenchi cavi **non** sono salvati: sono calcolati dallo schema
ogni volta, quindi non possono mai essere in disaccordo con esso.

## Versioni e migrazioni

Quando il formato cambia, la versione aumenta di uno e una migrazione trasforma la versione *n* in *n + 1*. Aprendo un
file più vecchio si eseguono tutte le migrazioni in sequenza, in memoria; il file è scritto nella nuova versione solo
quando salvi. Un file di un CablePilot più recente viene rifiutato con un messaggio chiaro (aggiorna l’app), mai letto
a metà. Un file danneggiato viene segnalato con ciò che non va e non viene modificato.

## Accanto al progetto

Questi restano nella cartella dati di CablePilot sul tuo computer, non nel progetto:

- **Salvataggio automatico e recupero:** una copia mentre lavori; dopo un arresto anomalo, CablePilot propone di
  recuperarla.
- **Cronologia:** un backup giornaliero e le versioni a cui dai un nome (**Cronologia**), confrontate con la copia di
  lavoro e ripristinate in un solo passo annullabile.
- **Libreria aziendale:** i tuoi simboli, modelli, macro, articoli e modelli di layout, come file di dati nello stesso
  formato della libreria integrata.
- **Impostazioni:** lingua, tema e disposizione dei pannelli; le chiavi API e le password ERP sono cifrate dal sistema
  operativo e mai scritte in chiaro.

## Formati di scambio

- **PDF:** il set di disegni o una pagina, vettoriale, in scala reale.
- **DXF:** pagine in ingresso e in uscita; la piastra di montaggio per la foratura.
- **CSV e XLSX:** ogni elenco (morsetti, cavi, fili, distinta, I/O PLC, marcatori, targhette, lista di prelievo).
- **Layout del quadro:** JSON e CSV documentati, vedi [formato di scambio del layout](layout-format.md).
- **ERP:** articoli e giacenze in ingresso, richieste di prenotazione in uscita, vedi [collegamento ERP](erp-link.md).
- **Liste tag PLC:** XML di TIA Portal e testo CODESYS, in uscita e in ingresso con anteprima.
