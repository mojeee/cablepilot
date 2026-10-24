// Validation rules for library data files (library/README.md). Shared by scripts/check-library.mjs,
// the unit tests and the app (company symbols saved from the symbol editor use the same rules).

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Element kinds a macro may hold: drawing content only (no generated pages).
const ELEMENT_KINDS = ['symbol', 'box', 'wire', 'junction', 'text', 'line', 'rect', 'warning'];

const GFX = {
  line: (g) => ['x1', 'y1', 'x2', 'y2'].every((k) => isNum(g[k])),
  poly: (g) => Array.isArray(g.pts) && g.pts.length >= 4 && g.pts.length % 2 === 0 && g.pts.every(isNum),
  rect: (g) => ['x', 'y', 'w', 'h'].every((k) => isNum(g[k])),
  circle: (g) => ['cx', 'cy', 'r'].every((k) => isNum(g[k])) && g.r > 0,
  arc: (g) => ['cx', 'cy', 'r', 'a0', 'a1'].every((k) => isNum(g[k])) && g.r > 0,
  text: (g) => isNum(g.x) && isNum(g.y) && typeof g.text === 'string' && isNum(g.size) && g.size > 0,
};

function checkGraphics(list, where, err) {
  if (!Array.isArray(list) || list.length === 0) return err(`${where} must be a non-empty array`);
  list.forEach((g, i) => {
    if (!isObj(g) || !GFX[g.t]) err(`${where}[${i}] has an unknown or missing type "t"`);
    else if (!GFX[g.t](g)) err(`${where}[${i}] (${g.t}) has a missing or invalid number`);
  });
}

// Parts the sizing engine can use (shared/sizing.ts) carry a `Type` and the technical fields sizing needs.
const SIZING_FIELDS = {
  MCB: ['Poles', 'Tripping characteristic', 'Rated current', 'Breaking capacity'],
  MPCB: ['Poles', 'Setting range', 'Breaking capacity'],
  Contactor: ['Poles', 'Rated operational current AC-3'],
  'Overload relay': ['Setting range'],
  'Power cable': ['Cores', 'Conductor cross-section'],
};

/** Required fields per kind: each checker receives the data and an error callback. */
export const KINDS = {
  'colour-codes': (d, err) => {
    if (!Array.isArray(d.colours) || d.colours.length === 0) return err('colours must be a non-empty array');
    const seen = new Set();
    for (const c of d.colours) {
      if (!isObj(c) || !/^[A-Z]{2,4}$/.test(c.code ?? '')) err(`bad colour code ${JSON.stringify(c?.code)}`);
      else if (seen.has(c.code)) err(`duplicate colour code ${c.code}`);
      else seen.add(c.code);
      if (!isObj(c?.name) || !isStr(c.name.en) || !isStr(c.name.it)) err(`colour ${c?.code}: name needs en and it`);
    }
  },
  symbol: (d, err) => {
    if (!isObj(d.title) || !isStr(d.title.en) || !isStr(d.title.it)) err('title needs en and it');
    if (!isStr(d.category)) err('category is required');
    if (!isStr(d.function)) err('function (the function type) is required');
    if (d.designationLetter !== undefined && !/^[A-Z]{0,2}$/.test(d.designationLetter)) err('designationLetter must be 0 to 2 capital letters');
    if (!Array.isArray(d.pins)) err('pins must be an array');
    else {
      const ids = new Set();
      d.pins.forEach((p, i) => {
        if (!isObj(p) || !isStr(p.id) || !isNum(p.x) || !isNum(p.y) || !['up', 'down', 'left', 'right'].includes(p.dir)) err(`pins[${i}] needs id, x, y and dir`);
        else if (ids.has(p.id)) err(`duplicate pin id ${p.id}`);
        else ids.add(p.id);
      });
    }
    checkGraphics(d.graphics, 'graphics', err);
    if (d.nfpa !== undefined) {
      if (!isObj(d.nfpa) || !isStr(d.nfpa.source)) err('nfpa needs a source');
      else checkGraphics(d.nfpa.graphics, 'nfpa.graphics', err);
    }
  },
  part: (d, err) => {
    if (!isObj(d.title) || !isStr(d.title.en) || !isStr(d.title.it)) err('title needs en and it');
    if (!isObj(d.description) || !isStr(d.description.en) || !isStr(d.description.it)) err('description needs en and it');
    if (!isStr(d.category)) err('category is required');
    if (!isStr(d.code)) err('code (the part code shown in the BOM) is required');
    if (!isStr(d.manufacturer)) err('manufacturer is required ("Generic" for built-in parts)');
    if (!isObj(d.data) || !Object.values(d.data).every(isStr)) err('data must be an object of text values (unit included, e.g. "16 A")');
    if (isObj(d.data) && d.data.Type !== undefined) {
      const need = SIZING_FIELDS[d.data.Type];
      if (!need) err(`data.Type "${d.data.Type}" is not a sizing type (${Object.keys(SIZING_FIELDS).join(', ')})`);
      else for (const k of need) if (!isStr(d.data[k]) || !/\d/.test(d.data[k]) && k !== 'Tripping characteristic') err(`a ${d.data.Type} needs data "${k}" for sizing`);
    }
    if (d.dimensions !== undefined && !(isObj(d.dimensions) && ['w', 'h', 'd'].every((k) => isNum(d.dimensions[k]) && d.dimensions[k] > 0))) err('dimensions needs positive w, h and d in millimetres');
  },
  macro: (d, err) => {
    if (!isObj(d.title) || !isStr(d.title.en) || !isStr(d.title.it)) err('title needs en and it');
    if (!isStr(d.category)) err('category is required');
    if (!isObj(d.size) || !isNum(d.size.w) || !isNum(d.size.h)) err('size needs w and h');
    if (!Array.isArray(d.elements) || d.elements.length === 0) err('elements must be a non-empty array');
    else {
      const ids = new Set();
      d.elements.forEach((e, i) => {
        if (!isObj(e) || !isStr(e.id) || !isStr(e.kind) || !ELEMENT_KINDS.includes(e.kind)) err(`elements[${i}] needs an id and a known kind`);
        else if (ids.has(e.id)) err(`duplicate element id ${e.id}`);
        else ids.add(e.id);
      });
    }
  },
  template: (d, err) => {
    if (!isObj(d.template) || !isStr(d.template.name) || !isObj(d.template.frame) || !isObj(d.template.titleBlock)) err('template needs name, frame and titleBlock');
  },
};

/** Problems found in one library file's data (empty: valid). `baseName` is the file name without .json. */
export function validateLibraryFile(d, baseName) {
  const problems = [];
  const err = (m) => problems.push(m);
  if (!isObj(d)) return ['must be a JSON object'];
  if (d.id !== baseName) err(`id must be "${baseName}"`);
  if (!isStr(d.source)) err('missing source (standard and clause, or catalogue)');
  if (!['primary', 'secondary'].includes(d.verification)) err('verification must be "primary" or "secondary"');
  if (d.verification === 'secondary' && !isStr(d.verifiedFrom)) err('a secondary verification needs verifiedFrom');
  const check = KINDS[d.kind];
  if (!check) err(`unknown kind ${JSON.stringify(d.kind)} (add it to scripts/library-validate.mjs)`);
  else check(d, err);
  return problems;
}
