// Every text of the website, in English and Italian. Templates use {{t:key}}; generated pages call
// tx(lang, key). A missing key or an empty Italian text fails the build (scripts/build-site.mjs).
// Texts are plain: no markup. Never type a number or a table value from a standard here: values come
// from library/ data. Do not mention other products' features we cannot back.

export const TEXT = {
  'nav.companies': { en: 'For companies', it: 'Per le aziende' },
  'nav.demo': { en: 'Demo', it: 'Demo' },
  'nav.download': { en: 'Download', it: 'Scarica' },
  'nav.main': { en: 'Main', it: 'Principale' },
  'nav.footer': { en: 'Footer', it: 'Piè di pagina' },
  'nav.skip': { en: 'Skip to content', it: 'Vai al contenuto' },
  'nav.home': { en: 'Home', it: 'Pagina iniziale' },
  'foot.tagline': {
    en: 'Electrical design for machines, control panels and electronics. Free and open source. Runs on your computer. Your files stay yours.',
    it: 'Progettazione elettrica per macchine, quadri ed elettronica. Libero e open source. Funziona sul tuo computer. I tuoi file restano tuoi.',
  },
  'foot.copyright': { en: 'Copyright Mojtaba Amini. Apache-2.0.', it: 'Copyright Mojtaba Amini. Apache-2.0.' },
  'foot.privacy': {
    en: 'This site sets no cookies, runs no scripts and loads nothing from third parties.',
    it: 'Questo sito non usa cookie, non esegue script e non carica nulla da terze parti.',
  },
  'foot.version': { en: 'Version', it: 'Versione' },
  'foot.discussions': { en: 'Discussions', it: 'Discussioni' },
  'foot.releases': { en: 'Releases', it: 'Versioni rilasciate' },

  'home.title': { en: 'CablePilot: open-source electrical design for machines and panels', it: 'CablePilot: progettazione elettrica open source per macchine e quadri' },
  'home.description': {
    en: 'Draw the schematic once; terminals, cables, BOM and cabinet follow. Free and open source electrical CAD that runs on your computer. Your files stay yours.',
    it: 'Disegna lo schema una volta; morsetti, cavi, distinta e quadro seguono. CAD elettrico libero e open source che funziona sul tuo computer. I tuoi file restano tuoi.',
  },
  'hero.eyebrow': { en: 'Electrical CAD for machine and panel builders', it: 'CAD elettrico per costruttori di macchine e quadri' },
  'hero.title': { en: 'Draw the schematic once. Terminals, cables, BOM and cabinet follow.', it: 'Disegna lo schema una volta. Morsetti, cavi, distinta e quadro seguono.' },
  'hero.lead': {
    en: 'Free and open source, runs on your computer, your files stay yours.',
    it: 'Libero e open source, funziona sul tuo computer, i tuoi file restano tuoi.',
  },
  'hero.download': { en: 'Download', it: 'Scarica' },
  'hero.demo': { en: 'Watch the demo', it: 'Guarda la demo' },
  'hero.video.note': { en: 'The demo loop will play here once it is recorded from the real app.', it: 'Il ciclo della demo verrà mostrato qui quando sarà registrato dall’app reale.' },
  'status.version': { en: 'Version', it: 'Versione' },
  'status.milestones': { en: 'milestones done', it: 'milestone completate' },
  'status.notOut': { en: 'The first release is not out yet.', it: 'La prima versione non è ancora uscita.' },
  'status.out': { en: 'The first release is out.', it: 'La prima versione è uscita.' },

  'today.title': { en: 'In the app today', it: 'Nell’app oggi' },
  'today.lead': {
    en: 'One block per feature area. A tag says whether it is available or still planned, and in which milestone. The tags follow the roadmap in the repository.',
    it: 'Un blocco per area funzionale. Un’etichetta indica se è disponibile o ancora pianificata, e in quale milestone. Le etichette seguono la roadmap nel repository.',
  },
  'tag.available': { en: 'Available', it: 'Disponibile' },
  'tag.planned': { en: 'Planned', it: 'Pianificato' },
  'tag.comingNext': { en: 'Coming in the next release', it: 'In arrivo nella prossima versione' },
  'feat.schematic.title': { en: 'Schematic', it: 'Schema' },
  'feat.schematic.text': {
    en: 'Multi-page projects with IEC symbols, single-line and multi-line pages, your own frame, title block and drawing style.',
    it: 'Progetti a più pagine con simboli IEC, pagine unifilari e multifilari, cornice, cartiglio e stile di disegno dell’azienda.',
  },
  'feat.devices.title': { en: 'Devices and cross-references', it: 'Dispositivi e riferimenti incrociati' },
  'feat.devices.text': {
    en: 'One device, several representations, counted once in the BOM and cross-referenced both ways. Connectors with named pins, macros, nested assemblies.',
    it: 'Un dispositivo, più rappresentazioni, contato una sola volta in distinta e con riferimenti incrociati nei due sensi. Connettori con pin nominati, macro, assiemi annidati.',
  },
  'feat.reports.title': { en: 'Wires and reports', it: 'Conduttori e report' },
  'feat.reports.text': {
    en: 'Automatic wire numbers, terminal diagrams, cable and wire lists, nameplates and exports, all generated live from the schematic.',
    it: 'Numerazione automatica dei conduttori, schemi morsettiere, liste cavi e fili, targhette ed esportazioni, tutto generato in tempo reale dallo schema.',
  },
  'feat.checks.title': { en: 'Checks and revisions', it: 'Controlli e revisioni' },
  'feat.checks.text': {
    en: 'A continuous electrical rule check with one-click fixes, issued revisions, a generated cover sheet and a comparison of two revisions.',
    it: 'Un controllo continuo delle regole elettriche con correzioni in un clic, revisioni emesse, copertina generata e confronto fra due revisioni.',
  },
  'feat.plc.title': { en: 'PLC', it: 'PLC' },
  'feat.plc.text': {
    en: 'PLC racks and I/O cards as devices, an I/O assignment overview, and tag lists in the formats the engineering tools accept.',
    it: 'Rack PLC e schede I/O come dispositivi, panoramica delle assegnazioni I/O ed elenchi di tag nei formati accettati dai tool di ingegneria.',
  },
  'feat.layout.title': { en: 'Cabinet layout', it: 'Layout del quadro' },
  'feat.layout.text': {
    en: 'Mounting plate to scale in 2D with dimensions and side view, a 3D view, duct fill rate and a drilling DXF.',
    it: 'Piastra di montaggio in scala in 2D con quote e vista laterale, vista 3D, riempimento delle canaline e DXF di foratura.',
  },
  'shot.theme': { en: 'Screenshot theme', it: 'Tema dello screenshot' },
  'shot.dark': { en: 'Dark', it: 'Scuro' },
  'shot.light': { en: 'Light', it: 'Chiaro' },
  'shot.pending': {
    en: 'Screenshots from the real app arrive with the release milestone.',
    it: 'Gli screenshot dell’app reale arriveranno con la milestone di rilascio.',
  },

  'set.title': { en: 'A complete drawing set', it: 'Un set di disegni completo' },
  'set.lead': {
    en: 'What the workshop gets, printed from the project with nothing drawn by hand afterwards. The thumbnails show the DC battery-charger sample once it exists.',
    it: 'Ciò che riceve il laboratorio, stampato dal progetto senza nulla da disegnare a mano dopo. Le miniature mostrano il campione del caricabatterie in corrente continua quando sarà pronto.',
  },
  'set.cover': { en: 'Cover with revisions', it: 'Copertina con revisioni' },
  'set.single': { en: 'Single-line', it: 'Unifilare' },
  'set.multi': { en: 'Multi-line', it: 'Multifilare' },
  'set.terminals': { en: 'Terminals', it: 'Morsettiere' },
  'set.layout': { en: 'Cabinet layout', it: 'Layout del quadro' },
  'set.bom': { en: 'BOM', it: 'Distinta materiali' },

  'ai.title': { en: 'AI inside, you decide', it: 'IA integrata, decidi tu' },
  'ai.lead.shipped': {
    en: 'An optional assistant with your own API key. It proposes, you accept or reject. Nothing is sent anywhere else.',
    it: 'Un assistente facoltativo con la tua chiave API. Propone, tu accetti o rifiuti. Nulla viene inviato altrove.',
  },
  'ai.lead.coming': {
    en: 'An optional assistant with your own API key is planned. It will propose, and you accept or reject. The app is fully usable without it.',
    it: 'È pianificato un assistente facoltativo con la tua chiave API. Proporrà, e tu accetti o rifiuti. L’app è pienamente utilizzabile anche senza.',
  },
  'ai.prompts': { en: 'Example prompts', it: 'Esempi di richieste' },
  'ai.p1': { en: 'Add a star-delta starter for a 7.5 kW motor on page 5', it: 'Aggiungi un avviatore stella-triangolo per un motore da 7,5 kW a pagina 5' },
  'ai.p2': { en: 'Renumber the wires on pages 3 to 8', it: 'Rinumera i conduttori delle pagine da 3 a 8' },
  'ai.p3': { en: 'Why does the check say Q3 is too small?', it: 'Perché il controllo dice che Q3 è troppo piccolo?' },
  'ai.proposal': { en: 'A proposal, with a source on every claim', it: 'Una proposta, con una fonte su ogni affermazione' },
  'ai.src.project': { en: 'Read from this project', it: 'Letto da questo progetto' },
  'ai.src.standard': { en: 'A standard and clause', it: 'Una norma e un articolo' },
  'ai.src.library': { en: 'A library entry', it: 'Una voce della libreria' },
  'ai.src.suggestion': { en: 'Suggestion: confirm it, with its assumptions', it: 'Suggerimento: da confermare, con le sue ipotesi' },
  'ai.accept': { en: 'Accept', it: 'Accetta' },
  'ai.reject': { en: 'Reject', it: 'Rifiuta' },
  'ai.note': {
    en: 'Electrical values the assistant proposes are always labelled as suggestions and must be confirmed by the engineer.',
    it: 'I valori elettrici proposti dall’assistente sono sempre indicati come suggerimenti e devono essere confermati dal progettista.',
  },

  'why.title': { en: 'Why CablePilot', it: 'Perché CablePilot' },
  'why.local.title': { en: 'Local first', it: 'Prima di tutto locale' },
  'why.local.text': { en: 'It runs on your computer. No account, no cloud, no tracking.', it: 'Funziona sul tuo computer. Nessun account, nessun cloud, nessun tracciamento.' },
  'why.format.title': { en: 'Open format', it: 'Formato aperto' },
  'why.format.text': {
    en: 'Projects are versioned JSON that diffs well in Git. PDF, DXF and CSV or XLSX out. No lock-in.',
    it: 'I progetti sono JSON versionato che si confronta bene in Git. PDF, DXF e CSV o XLSX in uscita. Nessun vincolo.',
  },
  'why.sourced.title': { en: 'Sourced values', it: 'Valori con fonte' },
  'why.sourced.text': {
    en: 'Every rule and table value cites its standard and clause. What we could not verify is listed, not shipped as fact.',
    it: 'Ogni regola e valore di tabella cita norma e articolo. Ciò che non abbiamo potuto verificare è elencato, non spacciato per certo.',
  },
  'why.open.title': { en: 'Open source', it: 'Open source' },
  'why.open.text': { en: 'Apache-2.0. Read it, change it, build on it.', it: 'Apache-2.0. Leggilo, modificalo, costruiscici sopra.' },

  'cmp.title': { en: 'How it compares', it: 'Il confronto' },
  'cmp.lead': {
    en: 'We only make claims we can back. This table shows what CablePilot offers and when. Columns for other tools are added only after each claim is verified against the vendor’s own documentation.',
    it: 'Facciamo solo affermazioni che possiamo sostenere. Questa tabella mostra cosa offre CablePilot e quando. Le colonne degli altri strumenti vengono aggiunte solo dopo aver verificato ogni affermazione sulla documentazione del produttore.',
  },
  'cmp.feature': { en: 'Capability', it: 'Funzione' },
  'cmp.status': { en: 'CablePilot', it: 'CablePilot' },
  'cmp.row.open': { en: 'Open source licence (Apache-2.0)', it: 'Licenza open source (Apache-2.0)' },
  'cmp.row.local': { en: 'Runs locally, no account', it: 'Funziona in locale, senza account' },
  'cmp.row.schematic': { en: 'Multi-page schematics with IEC symbols', it: 'Schemi a più pagine con simboli IEC' },
  'cmp.row.reports': { en: 'Live terminal, cable and wire lists and BOM', it: 'Liste morsetti, cavi, fili e distinta in tempo reale' },
  'cmp.row.checks': { en: 'Continuous electrical rule check', it: 'Controllo continuo delle regole elettriche' },
  'cmp.row.layout': { en: 'Cabinet layout to scale with a 3D view', it: 'Layout del quadro in scala con vista 3D' },
  'cmp.row.set': { en: 'Production drawing sets with revisions and cover sheet', it: 'Set di disegni di produzione con revisioni e copertina' },
  'cmp.row.ai': { en: 'Optional AI assistant with your own key', it: 'Assistente IA facoltativo con la tua chiave' },

  'dl.title': { en: 'Formats and download', it: 'Formati e download' },
  'dl.formats': { en: 'Export formats', it: 'Formati di esportazione' },
  'dl.formats.text': { en: 'PDF drawing sets, DXF (also in), CSV and XLSX lists, KiCad files from phase 2.', it: 'Set di disegni PDF, DXF (anche in ingresso), liste CSV e XLSX, file KiCad dalla fase 2.' },
  'dl.os': { en: 'Download per system', it: 'Download per sistema' },
  'dl.mac': { en: 'macOS (Apple silicon and Intel)', it: 'macOS (Apple silicon e Intel)' },
  'dl.win': { en: 'Windows', it: 'Windows' },
  'dl.linux': { en: 'Linux (AppImage)', it: 'Linux (AppImage)' },
  'dl.note': { en: 'No release is published yet. This button opens the releases page on GitHub.', it: 'Nessuna versione è ancora pubblicata. Questo pulsante apre la pagina delle versioni su GitHub.' },
  'dl.companies': { en: 'Working for a company? See the page for companies.', it: 'Lavori per un’azienda? Vedi la pagina per le aziende.' },

  'demo.title': { en: 'The demo', it: 'La demo' },
  'demo.pending': { en: 'Recording in progress. The demo is recorded from the real app by a script, so it can be made again whenever the interface changes.', it: 'Registrazione in corso. La demo è registrata dall’app reale da uno script, così può essere rifatta ogni volta che l’interfaccia cambia.' },

  'co.title': { en: 'CablePilot for companies: support, training and custom features', it: 'CablePilot per le aziende: supporto, formazione e funzioni su misura' },
  'co.description': {
    en: 'Support, training and custom features for electrical design teams: company symbol libraries, title blocks, macros and data migration. Apache-2.0, open format, no lock-in.',
    it: 'Supporto, formazione e funzioni su misura per i team di progettazione elettrica: librerie di simboli aziendali, cartigli, macro e migrazione dei dati. Apache-2.0, formato aperto, nessun vincolo.',
  },
  'co.h1': { en: 'For companies', it: 'Per le aziende' },
  'co.lead': {
    en: 'Electrical departments, panel builders and integrators can use CablePilot without paying for a licence, and ask us for help where it matters.',
    it: 'Uffici elettrici, quadristi e integratori possono usare CablePilot senza pagare una licenza e chiederci aiuto dove serve.',
  },
  'co.support.title': { en: 'Support', it: 'Supporto' },
  'co.support.text': { en: 'Help with installing, migrating a first project and using the drawing set features.', it: 'Aiuto per l’installazione, la migrazione di un primo progetto e l’uso delle funzioni del set di disegni.' },
  'co.training.title': { en: 'Training', it: 'Formazione' },
  'co.training.text': { en: 'Hands-on sessions for your team, on your own sample project.', it: 'Sessioni pratiche per il tuo team, sul tuo progetto di esempio.' },
  'co.custom.title': { en: 'Custom features', it: 'Funzioni su misura' },
  'co.custom.text': {
    en: 'Company symbol libraries, title blocks and frames, standard macros for your boards, and data migration from your existing files.',
    it: 'Librerie di simboli aziendali, cartigli e cornici, macro standard per le vostre schede e migrazione dei dati dai file esistenti.',
  },
  'co.safe.title': { en: 'Why it is safe to build on', it: 'Perché è sicuro costruirci sopra' },
  'co.safe.text': {
    en: 'Apache-2.0 licence, an open and documented project format, and no vendor lock-in: your drawings stay readable whatever happens to us.',
    it: 'Licenza Apache-2.0, formato di progetto aperto e documentato, nessun vincolo con il fornitore: i vostri disegni restano leggibili qualunque cosa accada a noi.',
  },
  'co.contact.title': { en: 'Get in touch', it: 'Mettiti in contatto' },
  'co.contact.text': { en: 'Open a topic in GitHub Discussions, or an issue for a bug or a feature request.', it: 'Apri un argomento nelle Discussioni di GitHub, oppure una issue per un errore o una richiesta di funzione.' },
  'co.contact.link': { en: 'GitHub Discussions', it: 'Discussioni su GitHub' },

  'nf.title': { en: 'Page not found', it: 'Pagina non trovata' },
  'nf.text': { en: 'This page does not exist (any more). Try the home page.', it: 'Questa pagina non esiste (più). Prova la pagina iniziale.' },
};
