#!/usr/bin/env node
// Encodes the raw recording (out/demo-video/demo-raw.webm + marks.json, written by e2e/demo.e2e.ts)
// into the website's files with ffmpeg: site/video/demo.webm (VP9) and demo.mp4 (H.264, faststart),
// the muted hero loop hero.webm and hero.mp4, poster frames in site/img/, and the WebVTT captions
// demo.en.vtt and demo.it.vtt timed from the marks. Trimming and encoding only: no editing.
//   node scripts/demo-video.mjs
// Needs ffmpeg and ffprobe on the PATH (or at /opt/homebrew/bin).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'out', 'demo-video');
const raw = join(rawDir, 'demo-raw.webm');
const videoDir = join(root, 'site', 'video');
const imgDir = join(root, 'site', 'img');
if (!existsSync(raw)) throw new Error(`no recording at ${raw}: run npm run record:demo (or node scripts/e2e.mjs --demo) first`);
mkdirSync(videoDir, { recursive: true });
mkdirSync(imgDir, { recursive: true });

const bin = (name) => (spawnSync(name, ['-version']).error ? `/opt/homebrew/bin/${name}` : name);
const ffmpeg = bin('ffmpeg');
const ffprobe = bin('ffprobe');
const run = (args) => {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};
const duration = (f) => Number(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout);

// Marks are wall-clock times of the test; the video ends when the app closes, shortly after __end.
const { marks } = JSON.parse(readFileSync(join(rawDir, 'marks.json'), 'utf8'));
const captions = JSON.parse(readFileSync(join(root, 'e2e', 'demo-captions.json'), 'utf8'));
const total = duration(raw);
const at = (id) => Math.max(0, total - (marks.__end + TAIL - marks[id]) / 1000);
const TAIL = 350; // ms between the last mark and the end of the recording (page close)

const start = Math.max(0, at(captions[0].id) - 0.6);
const end = Math.min(total, at(captions[captions.length - 1].id) + 6.5);
const length = end - start;
const trim = ['-ss', start.toFixed(2), '-t', length.toFixed(2)];

const vf = 'scale=1920:1080:flags=lanczos,fps=30';
run([...trim, '-i', raw, '-vf', vf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-an', join(videoDir, 'demo.webm')]);
run([...trim, '-i', raw, '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(videoDir, 'demo.mp4')]);

// The hero loop: about 15 s from the wire numbering and the reports that follow (from the mark "number").
const heroFrom = at('number');
const heroLen = 15;
const htrim = ['-ss', heroFrom.toFixed(2), '-t', String(heroLen)];
const hvf = 'scale=1280:720:flags=lanczos,fps=25';
run([...htrim, '-i', raw, '-vf', hvf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-an', join(videoDir, 'hero.webm')]);
run([...htrim, '-i', raw, '-vf', hvf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(videoDir, 'hero.mp4')]);

// Frames of the recording for the demo page: one per step (site/img/demo-N.png), and the posters.
const frame = (id, offset, out, src = join(videoDir, 'demo.mp4')) => run(['-ss', Math.max(0, at(id) - start + offset).toFixed(2), '-i', src, '-frames:v', '1', join(imgDir, out)]);
frame('cover', 3.0, 'demo-1.png');
frame('part', -0.8, 'demo-2.png');
frame('bom', 2.6, 'demo-3.png');
frame('loose', 2.6, 'demo-4.png');
frame('plc', 2.2, 'demo-5.png');
frame('pdf', 1.2, 'demo-6.png');
frame('pick', 1.9, 'demo-7.png');
frame('open', 3.0, 'demo-poster.png');
run(['-ss', String(Math.max(0, at('wirelist') - heroFrom + 1.2).toFixed(2)), '-i', join(videoDir, 'hero.mp4'), '-frames:v', '1', join(imgDir, 'hero-poster.png')]);

// Captions: each starts at its mark and ends when the next starts (the last at the end of the video).
const ts = (s) => {
  const ms = Math.round(Math.max(0, s) * 1000);
  const p = (n, w) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000), 2)}:${p(Math.floor(ms / 60000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)}.${p(ms % 1000, 3)}`;
};
for (const lang of ['en', 'it']) {
  const cues = captions.map((c, i) => {
    const from = at(c.id) - start + 0.25;
    const to = (i + 1 < captions.length ? at(captions[i + 1].id) - start + 0.1 : length) - 0.1;
    return `${i + 1}\n${ts(from)} --> ${ts(to)}\n${c[lang]}\n`;
  });
  writeFileSync(join(videoDir, `demo.${lang}.vtt`), `WEBVTT\n\n${cues.join('\n')}`);
}
for (const f of ['demo.webm', 'demo.mp4', 'hero.webm', 'hero.mp4']) {
  console.log(`${f}: ${(statSync(join(videoDir, f)).size / 1024 / 1024).toFixed(2)} MB, ${duration(join(videoDir, f)).toFixed(1)} s`);
}
