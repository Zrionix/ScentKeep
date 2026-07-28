/* eslint-disable */
/**
 * Verifies that every URL the app hands to App Review is actually live and
 * publicly reachable — no login wall, no 404.
 *
 *   node scripts/check-links.js
 *
 * This is a pre-submission blocker check. A Privacy URL that 404s, or that sits
 * behind Vercel's SSO protection, is an automatic rejection, and it is the kind
 * of thing that only breaks long after the code that referenced it was written.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'links.ts'), 'utf8');

const base = /SITE_BASE\s*=\s*'([^']+)'/.exec(src)?.[1];
if (!base) {
  console.error('Could not read SITE_BASE from src/lib/links.ts');
  process.exit(1);
}

const TARGETS = [
  { name: 'marketing site', url: base },
  { name: 'privacy policy', url: `${base}/privacy` },
  { name: 'terms of use', url: `${base}/terms` },
  { name: 'support', url: `${base}/support` },
];

let failed = 0;

(async () => {
  for (const t of TARGETS) {
    try {
      const res = await fetch(t.url, { redirect: 'follow' });
      const body = res.status === 200 ? await res.text() : '';

      // A Vercel SSO wall answers 200 with a login page, so status alone is not
      // enough — check the page is the content we published.
      const looksProtected = /Authentication Required|vercel\.com\/sso|_vercel\/sso/i.test(body);
      const hasContent = /ScentKeep/i.test(body);
      const ok = res.status === 200 && !looksProtected && hasContent;

      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${t.name.padEnd(16)} ${res.status}  ${t.url}`);
      if (!ok) {
        failed += 1;
        if (looksProtected) console.log('        -> behind deployment protection; App Review cannot read it');
        else if (!hasContent) console.log('        -> reachable but does not look like the ScentKeep site');
      }
    } catch (e) {
      failed += 1;
      console.log(`  FAIL  ${t.name.padEnd(16)} unreachable — ${e.message}`);
    }
  }

  console.log(failed === 0 ? '\nAll review URLs are live and public.' : `\n${failed} URL problem(s).`);
  process.exit(failed === 0 ? 0 : 1);
})();
