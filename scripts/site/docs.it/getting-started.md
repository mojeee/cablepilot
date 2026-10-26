<!--
Italian text of the guide /it/docs/getting-started/, translated from docs/getting-started.md.
"source" is the hash the build prints when the English file changes; update it together with the translation.
source: 52606739ed
-->
# Per iniziare

CablePilot è un’app desktop per la progettazione elettrica di macchine e quadri: schemi multipagina con simboli IEC,
designazioni, riferimenti incrociati e numeri di filo; morsettiere, elenchi cavi e fili, liste I/O PLC e distinta
generati dallo schema; il layout del quadro in 2D e 3D; e un set di disegni PDF nella cornice e nel cartiglio della tua
azienda. Funziona sul tuo computer, non richiede un account e lavora offline.

## Installazione

Scarica il file per il tuo computer dall’[ultima versione](https://github.com/mojeee/cablepilot/releases/latest):

| Computer | File |
|---|---|
| Mac con Apple Silicon (M1 e successivi) | `CablePilot-mac-arm64.dmg` |
| Mac con processore Intel | `CablePilot-mac-x64.dmg` |
| Windows 10 o 11 (64 bit) | `CablePilot-win-x64.exe` |
| Linux (64 bit) | `CablePilot-linux-x86_64.AppImage` |

Le build non sono ancora firmate. Su Mac, apri l’app la prima volta con clic destro > **Apri** e conferma. Su Windows,
scegli **Ulteriori informazioni > Esegui comunque** se SmartScreen avvisa. Su Linux, rendi eseguibile l’AppImage
(`chmod +x CablePilot-linux-x86_64.AppImage`) e avviala.

Ogni funzione è gratuita per 30 giorni su ogni computer, senza account. Dopo la prova CablePilot richiede una chiave
di licenza, una per utente o postazione: vedi [Prezzi](https://cablepilot.agentflowbind.com/it/#pricing). I tuoi
progetti e le esportazioni restano tuoi, anche senza chiave.

## I tuoi primi dieci minuti

1. **Apri un esempio.** Scegli **Progetti di esempio** nella barra in alto: il nastro trasportatore con avviamento
   diretto, la stazione di pompaggio o il caricabatterie 110 V DC (27 pagine). Ogni funzione si può provare su di essi.
2. **Muoviti.** L’elenco delle pagine è a sinistra. Ingrandisci con la rotella, sposta con il tasto centrale o con
   Spazio + trascinamento, e premi **F** (o **Adatta alla pagina** nella barra di stato) per vedere tutto il foglio.
3. **Inserisci un simbolo.** Cerca nell’elenco dei simboli (premi **/**), fai clic su un simbolo, poi sulla pagina. La
   designazione è assegnata da sola (`-K1`, `-Q2`...), secondo la IEC 81346. Durante l’inserimento **R** ruota e **M**
   specchia.
4. **Disegna un filo.** Premi **W**, fai clic da pin a pin, **Invio** per finire. Un simbolo inserito su un filo
   esistente lo divide tra i suoi pin.
5. **Crea un dispositivo.** Dai a un contatto la stessa designazione di una bobina: diventano un solo dispositivo e i
   riferimenti incrociati compaiono su entrambi (`08-E3` o `8.3`, come impostato nelle impostazioni del progetto).
6. **Assegna un articolo.** In **Proprietà**, scegli un articolo dalla libreria: la distinta lo conta subito.
7. **Numera i fili.** **Fili > Numera fili** usa il tuo schema (per potenziale, per pagina e colonna, sequenziale, o
   per ramo nelle pagine ladder). Vedi [Come funziona la numerazione](numbering.md).
8. **Guarda gli elenchi.** **Report > Report**: morsettiere, elenchi cavi e fili, elenchi pin dei connettori, la
   distinta, le legende e altro, tutti generati dallo schema e aggiornati dal vivo.
9. **Controlla.** Il banner degli avvisi compare appena il controllo delle regole elettriche trova qualcosa (un filo
   scollegato, una designazione doppia, un cavo troppo piccolo per il suo interruttore). Molti problemi si correggono
   con un clic.
10. **Stampa il set.** **Esporta PDF** scrive tutto il set di disegni, o una pagina, come PDF vettoriale in scala reale.

Tutto ciò che fai si può annullare (**Ctrl+Z**), comprese importazioni, rinumerazioni e le proposte dell’assistente.

## Lavorare come nel tuo CAD

La riga di comando in basso accetta i comandi che i progettisti elettrici conoscono: `L`, `PL`, `REC`, `C`, `M`, `CO`,
`RO`, `MI`, `E`, `TR`, `EX`, `O`, `Z`, `ZE`, `U`, `PAN`, `LA`, `DI`, più quelli di CablePilot (`INSERT`, `WIRE`,
`NUMBER`, `REPORT`, `CHECK`, `SIZE`, `ERP`, `LADDER`, `AUTOWIRE`, `HISTORY`). **Invio** o **Spazio** ripete l’ultimo
comando, **Esc** annulla. I punti si possono scrivere: `30,40` (assoluto), `@60,0` (relativo), `@50<90` (polare
relativo). La barra di stato attiva gli aiuti al disegno: griglia **F7**, orto **F8**, snap **F9**, snap a oggetto
**F3**, puntamento polare **F10**. Premi **F1** per l’elenco completo dei tasti.

## I tuoi file

Un progetto è un unico file, `nome.cablepilot.json`: JSON aperto e documentato che si confronta bene in Git
([formato del file](file-format.md)). CablePilot salva automaticamente mentre lavori e propone il recupero dopo un
arresto anomalo; **Cronologia** conserva un backup giornaliero e le versioni a cui dai un nome, e ne ripristina una in
un solo passo annullabile.

## Facoltativo: l’assistente

L’assistente IA usa la tua chiave API (Claude, OpenAI o Gemini), salvata cifrata dal sistema operativo. Apri
**Impostazioni IA** nel pannello chat, incolla la chiave e premi **Prova la chiave**. L’assistente propone le modifiche
come anteprima che accetti o rifiuti; ogni affermazione mostra la sua fonte e i valori elettrici sono indicati come
suggerimenti da confermare. Senza chiave, l’app funziona completamente.

## Dove andare dopo

- [Come funziona la numerazione](numbering.md): designazioni, numeri di filo e morsetti.
- [Formato del file di progetto](file-format.md): cosa c’è nel file e come vengono migrate le versioni.
- [Collegamento ERP](erp-link.md) e [formato di scambio del layout](layout-format.md): condividere dati con il tuo ERP.
- Domande e idee: [Discussioni su GitHub](https://github.com/mojeee/cablepilot/discussions).
