// Validation rules for library data files (library/README.md). Shared by scripts/check-library.mjs,
// the unit tests and the app (company symbols saved from the symbol editor use the same rules).

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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
