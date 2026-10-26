<!--
Italian text of the guide /it/docs/numbering/, translated from docs/numbering.md.
"source" is the hash the build prints when the English file changes; update it together with the translation.
source: 8e0dc4e9b9
-->
# Come funziona la numerazione

CablePilot numera tre cose per te: le **designazioni dei dispositivi**, i **numeri di filo** e i **morsetti**. Ognuna
è un unico comando che puoi annullare, e i numeri scritti a mano vengono mantenuti.

## Designazioni dei dispositivi (IEC 81346)

Una designazione ha fino a tre aspetti: `=funzione`, `+luogo` e `-prodotto`, per esempio `=M1+DS-K3`.

- **Aspetto di prodotto.** Quando inserisci un simbolo, riceve il primo numero libero per la sua lettera, per la
  funzione e il luogo di quella pagina: una bobina o un contattore è `-K`, un interruttore `-Q`, un motore `-M`, un
  morsetto `-X`, e così via (la lettera arriva con ogni simbolo della libreria).
- **Funzione e luogo.** Una pagina ha una `=funzione` e un `+luogo` predefiniti (proprietà della pagina). Un simbolo li
  eredita a meno che non indichi un luogo proprio, quindi `-K3` su una pagina di `+DS` è il dispositivo `+DS-K3`.
- **Un dispositivo, molti simboli.** Ogni simbolo e scatola con la stessa designazione completa è lo stesso
  dispositivo: una bobina e i suoi contatti, oppure i simboli unifilare e multifilare di un interruttore. Sono contati
  una sola volta in distinta e hanno riferimenti incrociati in entrambe le direzioni. Se cambi la designazione di una
  rappresentazione, tutte le altre seguono.
- **Rinumera.** **Rinumera** (scheda Fili, o **Ctrl+Shift+R**) numera di nuovo i dispositivi del progetto, per
  funzione, luogo e lettera: 1, 2, 3... in ordine di lettura (ordine delle pagine, poi da sinistra a destra, dall’alto
  in basso). Tutte le rappresentazioni di un dispositivo mantengono un’unica designazione, e i suoi articoli,
  l’assieme che lo contiene e i connettori accoppiati seguono. La rinumerazione di una pagina mantiene i dispositivi che
  compaiono anche su altre pagine.

I riferimenti incrociati si mostrano come `pagina.colonna` (`8.3`) o `pagina-colonna-riga` (`08-E3`), con il numero di
pagina completato alle cifre che scegli (Impostazioni del progetto > Riferimenti incrociati).

## Numeri di filo

**Numera fili** (scheda Fili, o il comando `NUMBER`) dà un numero a ogni filo secondo lo schema e il modello in
**Fili e cavi > Numerazione**.

- **Cosa condivide un numero.** I fili collegati tra loro formano una rete. Una rete e ogni rete unita a essa da punti
  di interruzione con lo stesso nome di segnale, o tramite pin di connettori accoppiati, formano un gruppo e
  condividono un numero, anche tra pagine diverse.
- **Quali pagine.** Si numerano le pagine di potenza, comando, PLC, morsettiere, cavi e layout. Le pagine unifilari,
  i fogli dati e le pagine di report no, e un filo disegnato come fascio porta un’etichetta invece di un numero.
- **I numeri scritti restano.** Un numero scritto su un filo è bloccato: la rinumerazione lo mantiene e non lo
  assegna mai due volte.

### Schemi

| Schema | Contatore | Modello predefinito | Esempio |
|---|---|---|---|
| Per potenziale | un contatore per potenziale (L1, L+, 24 V...) | `{n:3}{suffix}` | `020L+`, `021L+`, `005U` |
| Per pagina e colonna | un contatore per colonna della pagina | `{page:2}.{col}.{n}` | `08.3.1`, `08.3.2` |
| Sequenziale | un contatore per il progetto | `{n}` | `1`, `2`, `3` |
| Per ramo (pagine ladder) | un contatore per ramo | `{rung}{sub}` | `205`, `205A`, `205B` |

I gruppi sono numerati in ordine di lettura: la pagina del primo filo del gruppo, poi da sinistra a destra e
dall’alto in basso.

### Segnaposto del modello

| Segnaposto | Significato |
|---|---|
| `{n}`, `{n:3}` | il contatore, eventualmente completato a 3 cifre (`007`) |
| `{page}`, `{page:2}` | il numero di pagina del primo filo del gruppo, eventualmente completato |
| `{col}`, `{row}` | la zona della cornice del primo filo del gruppo |
| `{potential}` | il nome del potenziale (L1, 24VDC...) |
| `{suffix}` | il suffisso della classe di filo di quel potenziale (Fili e cavi > Classi di filo) |
| `{rung}` | il numero di riga del ramo in una pagina ladder (nelle altre pagine: pagina-colonna) |
| `{sub}` | niente per il primo filo di un ramo, poi `A`, `B`... |

**Inizia da** e **Passo** impostano il primo numero e l’incremento. La numerazione di una pagina rinumera solo i
gruppi che la toccano e mantiene i numeri già usati dalle altre pagine.

**Inserire un simbolo su un filo numerato** divide il filo tra i pin del simbolo. Se il filo aveva un numero
automatico, i fili della pagina vengono numerati di nuovo nello stesso passo annullabile, così entrambi i tratti hanno
il proprio numero.

### Pagine ladder

Una pagina ladder (comando `LADDER`, o la casella **Pagina ladder** in **Aggiungi una pagina** per le pagine di potenza,
comando e PLC) ha due montanti e rami numerati. I numeri di riga partono da pagina × 100 (pagina 2: 200, 201, 202...).
In una pagina ladder i riferimenti incrociati sono numeri di riga, e lo schema **Per ramo** dà a ogni filo il numero
del ramo da cui parte. Sono le convenzioni nordamericane abituali per i disegni NFPA 79, non requisiti della norma;
verificale con ciò che si aspettano i tuoi clienti.

## Morsetti

**Numera i morsetti ora** (Fili e cavi > Numerazione) numera i morsetti di ogni morsettiera 1, 2, 3... in ordine di
lettura. Un morsetto inserito in una morsettiera riceve il primo numero libero di quella morsettiera.

## Annulla

Ogni numerazione è un unico comando: **Ctrl+Z** riporta tutti i numeri precedenti in una volta.
