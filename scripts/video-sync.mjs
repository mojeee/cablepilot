// Finds the sync frame of a recording made by the e2e tests (e2e/recorder.ts: the window turns magenta for a moment)
// and returns its time in seconds, so the marks of a test map onto the video exactly. Playwright writes the recording
// at a constant 25 frames a second from the moment the window opens, so the first magenta frame's index gives the time.
import { spawnSync } from 'node:child_process';

export function findSync(ffmpeg, file, searchSeconds = 30) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-t', String(searchSeconds), '-i', file, '-vf', 'fps=25,crop=48:48:8:8,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${file}`);
  const px = r.stdout;
  for (let i = 0; i + 2 < px.length; i += 3) {
    const [red, green, blue] = [px[i], px[i + 1], px[i + 2]];
    if (red > 200 && blue > 200 && green < 80) return i / 3 / 25;
  }
  return null;
}
