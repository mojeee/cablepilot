// SVG images need a raster for the PDF (pdf-lib embeds PNG and JPEG); the canvas makes it.
import type { Asset } from '@shared/model/types';

export async function rasterizeSvg(a: Asset): Promise<Uint8Array> {
  const img = new Image();
  img.src = `data:image/svg+xml;base64,${a.data}`;
  await img.decode();
  const k = 2000 / Math.max(a.w, a.h, 1);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(a.w * k));
  c.height = Math.max(1, Math.round(a.h * k));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) throw new Error('could not rasterise the SVG');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Reads an image file into an asset (PNG, JPEG or SVG) with its natural size. */
export async function readImageFile(file: File): Promise<{ asset: Asset } | { error: string }> {
  const mime = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name) ? 'image/svg+xml' : file.type === 'image/png' ? 'image/png' : file.type === 'image/jpeg' ? 'image/jpeg' : null;
  if (!mime) return { error: 'type' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const data = btoa(bin);
  const img = new Image();
  img.src = `data:${mime};base64,${data}`;
  try {
    await img.decode();
  } catch {
    return { error: 'decode' };
  }
  const w = img.naturalWidth || 100, h = img.naturalHeight || 100;
  return { asset: { name: file.name, mime, data, w, h } };
}
