#!/usr/bin/env node
// Encodes the short clips recorded by e2e/clips.e2e.ts (out/clips/<clip>-<lang>.webm with its marks) into the
// website's files with ffmpeg: site/video/clip-<clip>-<lang>.mp4 (1280 x 720, H.264, faststart, no audio) and a .jpg
// poster frame. The captions are already in the picture. Trimming and encoding only: no editing.
//   node scripts/clips-video.mjs              every recorded clip
//   node scripts/clips-video.mjs erp ai       some clips
// Needs ffmpeg and ffprobe on the PATH (or at /opt/homebrew/bin).

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findSync } from './video-sync.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'out', 'clips');
const videoDir = join(root, 'site', 'video');
if (!existsSync(rawDir)) throw new Error(`no recordings in ${rawDir}: run npm run record:clips first`);
mkdirSync(videoDir, { recursive: true });

const bin = (name) => (spawnSync(name, ['-version']).error ? `/opt/homebrew/bin/${name}` : name);
const ffmpeg = bin('ffmpeg');
const ffprobe = bin('ffprobe');
const run = (args) => {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};
const duration = (f) => Number(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout);

const wanted = process.argv.slice(2);
const TAIL = 0.25; // seconds between the "close" mark and the end of the recording
for (const f of readdirSync(rawDir).filter((x) => x.endsWith('.json')).sort()) {
  const { clip, lang, marks } = JSON.parse(readFileSync(join(rawDir, f), 'utf8'));
  if (wanted.length && !wanted.includes(clip)) continue;
  const raw = join(rawDir, `${clip}-${lang}.webm`);
  if (!existsSync(raw) || !marks.start || !marks.end) {
    console.warn(`skipped ${clip}-${lang}: the recording is incomplete`);
    continue;
  }
  const total = duration(raw);
  // The sync frame (marks.sync, e2e/recorder.ts) places the marks exactly; older recordings assume TAIL after "close".
  const syncAt = marks.sync ? findSync(ffmpeg, raw) : null;
  if (marks.sync && syncAt === null) throw new Error(`${clip}-${lang}: the sync frame was not found in the recording`);
  const at = (ms) => Math.max(0, syncAt !== null ? syncAt + (ms - marks.sync) / 1000 : total - TAIL - (marks.close - ms) / 1000);
  const start = Math.max(0, at(marks.start) - 0.5);
  const end = Math.min(total, at(marks.end) + 0.6);
  const length = end - start;
  const mp4 = join(videoDir, `clip-${clip}-${lang}.mp4`);
  run(['-ss', start.toFixed(2), '-t', length.toFixed(2), '-i', raw, '-vf', 'scale=1280:720:flags=lanczos,fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
  // The poster: a frame a little past the middle, when the clip shows its result.
  run(['-ss', (length * 0.62).toFixed(2), '-i', mp4, '-frames:v', '1', '-q:v', '4', join(videoDir, `clip-${clip}-${lang}.jpg`)]);
  console.log(`site/video/clip-${clip}-${lang}.mp4: ${length.toFixed(1)} s`);
}
