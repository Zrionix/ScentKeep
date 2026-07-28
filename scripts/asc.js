/* eslint-disable */
/**
 * App Store Connect REST API helper (ES256 JWT).
 *
 *   node scripts/asc.js verify              # prove the key works
 *   node scripts/asc.js apps                # list apps on the team
 *   node scripts/asc.js app com.scentkeep.app
 *
 * The ASC web UI's session expires fast and its state display is unreliable, so
 * every check that CAN be done by API is done by API (Tips §15).
 *
 * The private key is read from disk at call time and never printed. Key id and
 * issuer id come from env or from the filename, so no identifier is hardcoded
 * into a committed file either.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CRED_DIR = path.join(__dirname, '..', 'credentials');
const ISSUER = process.env.ASC_ISSUER_ID || '905684d2-c99b-4bb1-91dc-98bcf84d2c81';

/** Finds an App Store Connect API key (AuthKey_XXXX.p8) in credentials/. */
function findKey() {
  const explicit = process.env.ASC_KEY_PATH;
  if (explicit) {
    return { file: explicit, keyId: path.basename(explicit).replace(/^AuthKey_|\.p8$/g, '') };
  }
  if (!fs.existsSync(CRED_DIR)) return null;
  const match = fs.readdirSync(CRED_DIR).find((f) => /^AuthKey_.+\.p8$/.test(f));
  if (!match) return null;
  return {
    file: path.join(CRED_DIR, match),
    keyId: match.replace(/^AuthKey_|\.p8$/g, ''),
  };
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function jwt(keyFile, keyId) {
  const key = fs.readFileSync(keyFile, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' };
  const signing = `${b64(header)}.${b64(payload)}`;
  const sig = crypto
    .sign('sha256', Buffer.from(signing), { key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${signing}.${sig}`;
}

async function api(method, endpoint, body) {
  const found = findKey();
  if (!found) {
    throw new Error(
      'No App Store Connect API key found. Put AuthKey_<KEYID>.p8 in credentials/ (see credentials/README.md).',
    );
  }
  const res = await fetch(`https://api.appstoreconnect.apple.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt(found.file, found.keyId)}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, keyId: found.keyId, body: text ? JSON.parse(text) : {} };
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);

  if (!cmd || cmd === 'verify') {
    const r = await api('GET', '/v1/apps?limit=1');
    if (r.status === 200) {
      console.log(`  PASS  key ${r.keyId} authenticates against App Store Connect`);
      console.log(`        issuer ${ISSUER}`);
      // No process.exit(0) here: on Windows, exiting while fetch's libuv handles
      // are still closing trips an assertion and prints a scary-looking crash
      // after a successful run. Letting the process end naturally avoids it.
      return;
    }
    console.log(`  FAIL  status ${r.status}`);
    console.log('       ', JSON.stringify(r.body?.errors?.[0] ?? r.body).slice(0, 300));
    process.exitCode = 1;
    return;
  }

  if (cmd === 'apps') {
    const r = await api('GET', '/v1/apps?limit=200');
    if (r.status !== 200) {
      console.log(`FAIL ${r.status}`, JSON.stringify(r.body).slice(0, 300));
      process.exitCode = 1;
      return;
    }
    for (const a of r.body.data ?? []) {
      console.log(
        `  ${a.id.padEnd(12)} ${(a.attributes.bundleId ?? '').padEnd(30)} ${a.attributes.name}`,
      );
    }
    console.log(`\n  ${(r.body.data ?? []).length} app(s).`);
    return;
  }

  if (cmd === 'app') {
    const r = await api('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(arg)}`);
    const app = r.body.data?.[0];
    if (!app) {
      console.log(`  No app record for ${arg} yet.`);
      process.exitCode = 2;
      return;
    }
    console.log(`  id        ${app.id}`);
    console.log(`  name      ${app.attributes.name}`);
    console.log(`  bundleId  ${app.attributes.bundleId}`);
    console.log(`  sku       ${app.attributes.sku}`);
    return;
  }

  console.log('Usage: node scripts/asc.js [verify|apps|app <bundleId>]');
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
