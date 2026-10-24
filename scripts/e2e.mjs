// End-to-end tests of the built Electron app (e2e/*.e2e.ts, Playwright): builds, then runs them.
// On Linux without a display they run under xvfb-run. Extra arguments go to Playwright, e.g.
//   npm run test:e2e -- -g "sample"
import { spawnSync } from 'node:child_process';

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!process.argv.includes('--no-build')) run('npm', ['run', 'build']);
// --screenshots: only the website screenshots test, which is skipped otherwise (writes site/img/*.png).
if (process.argv.includes('--screenshots')) process.env.CP_SCREENSHOTS = '1';
const extra = process.argv.slice(2).filter((a) => a !== '--no-build' && a !== '--screenshots');
const pw = ['playwright', 'test', '-c', 'e2e/playwright.config.ts', ...(process.argv.includes('--screenshots') ? ['-g', 'screenshots'] : []), ...extra];
if (process.platform === 'linux' && !process.env.DISPLAY) run('xvfb-run', ['-a', '-s', '-screen 0 1920x1200x24', 'npx', ...pw]);
else run('npx', pw);
