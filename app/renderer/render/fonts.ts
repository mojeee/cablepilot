// The PDF font (Roboto, SIL OFL: shared/fonts) as bytes, loaded on first use: the font files are
// bundled into the renderer as data URLs, so the export works offline and without file access.
let cache: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;

/** Decodes a base64 data URL by hand: the content security policy does not allow fetch() on data: URLs. */
function bytes(url: string): Uint8Array {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function loadPdfFonts(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  cache ??= (async () => {
    const [r, b] = await Promise.all([import('@shared/fonts/Roboto-Regular.ttf?inline'), import('@shared/fonts/Roboto-Bold.ttf?inline')]);
    return { regular: bytes(r.default), bold: bytes(b.default) };
  })();
  return cache;
}
