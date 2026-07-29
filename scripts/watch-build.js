/* eslint-disable */
/**
 * Polls an EAS build until it reaches a terminal state.
 *
 *   node scripts/watch-build.js [platform]
 *
 * Uses `eas build:list --json` rather than scraping the human-readable output,
 * which changes between CLI releases and silently breaks a grep-based watcher.
 */
const { execFile } = require('node:child_process');

const PLATFORM = process.argv[2] || 'ios';
const INTERVAL_MS = 30_000;
const MAX_POLLS = 80; // ~40 minutes

const TERMINAL = new Set(['FINISHED', 'ERRORED', 'CANCELED']);

function latestBuild() {
  return new Promise((resolve, reject) => {
    execFile(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['--yes', 'eas-cli@latest', 'build:list', '--limit', '1', '--platform', PLATFORM, '--json', '--non-interactive'],
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) return reject(err);
        // The CLI prints warnings before the JSON, so take from the first '['.
        const start = stdout.indexOf('[');
        if (start === -1) return reject(new Error('no JSON in output'));
        try {
          resolve(JSON.parse(stdout.slice(start))[0]);
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

(async () => {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    let b;
    try {
      b = await latestBuild();
    } catch (e) {
      console.log(`  poll ${i}: ${e.message}`);
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }

    const mins = Math.round((i * INTERVAL_MS) / 60000);
    console.log(`[${String(mins).padStart(2)}m] ${b.status.padEnd(12)} build ${b.buildNumber ?? '?'}  ${b.id}`);

    if (TERMINAL.has(b.status)) {
      console.log('');
      console.log('status      :', b.status);
      console.log('platform    :', b.platform);
      console.log('profile     :', b.buildProfile);
      console.log('version     :', b.appVersion, 'build', b.buildNumber);
      if (b.artifacts?.buildUrl) console.log('artifact    :', b.artifacts.buildUrl);
      if (b.error) console.log('error       :', JSON.stringify(b.error).slice(0, 400));
      console.log('logs        :', `https://expo.dev/accounts/zrionix/projects/scentkeep/builds/${b.id}`);
      process.exitCode = b.status === 'FINISHED' ? 0 : 1;
      return;
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  console.log('Timed out waiting for the build.');
  process.exitCode = 2;
})();
