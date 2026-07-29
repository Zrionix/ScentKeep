/* eslint-disable */
/**
 * Shared App Store Connect plumbing.
 *
 * Extracted because four scripts had grown their own copy of the same ES256 JWT
 * signer and the same fetch wrapper, and they had already started to drift — one
 * of them reported errors without the `detail` field, which is the only part of
 * an Apple error that ever tells you what is actually wrong.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APP_ID = '6795710068';
const KEY_ID = 'X25AAYH8QT';
const ISSUER = '905684d2-c99b-4bb1-91dc-98bcf84d2c81';
const KEY_PATH = path.join(__dirname, '..', 'credentials', `AuthKey_${KEY_ID}.p8`);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const claims = { iss: ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' };
  const signing = `${b64(header)}.${b64(claims)}`;
  const sig = crypto
    .sign('sha256', Buffer.from(signing), {
      key: fs.readFileSync(KEY_PATH, 'utf8'),
      // Apple wants a raw r||s signature. Node defaults to DER, which Apple
      // rejects with a bare 401 and no explanation at all.
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');
  return `${signing}.${sig}`;
}

async function api(method, endpoint, body) {
  const res = await fetch('https://api.appstoreconnect.apple.com' + endpoint, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (res.status >= 400) {
    const errors = (json.errors ?? [])
      .map((e) => `${e.title}: ${e.detail}${e.source?.pointer ? ` (${e.source.pointer})` : ''}`)
      .join(' | ');
    throw new Error(`${method} ${endpoint} -> ${res.status} ${errors || text.slice(0, 300)}`);
  }
  return json;
}

/** GET that treats "not found" as "not set yet" rather than as a failure.
 *  Apple is inconsistent about which it means: a missing to-one relationship
 *  sometimes 404s and sometimes returns 200 with `data: null`. */
async function optional(endpoint) {
  try {
    return (await api('GET', endpoint)).data ?? null;
  } catch (e) {
    if (/-> 404/.test(e.message)) return null;
    throw e;
  }
}

/**
 * Apple's three-step asset upload: reserve, PUT the bytes, commit.
 *
 * The signed upload URLs must NOT carry the Authorization header — including it
 * makes the storage layer reject the PUT with an opaque 403 that looks nothing
 * like an auth problem.
 */
async function uploadAsset({ createPath, type, attributes, relationships, bytes, patchPath }) {
  const created = await api('POST', createPath, {
    data: { type, attributes, relationships },
  });
  const asset = created.data;

  for (const op of asset.attributes.uploadOperations ?? []) {
    const headers = {};
    for (const h of op.requestHeaders ?? []) headers[h.name] = h.value;
    const res = await fetch(op.url, {
      method: op.method,
      headers,
      body: bytes.subarray(op.offset, op.offset + op.length),
    });
    if (!res.ok) {
      throw new Error(`asset chunk upload failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  }

  const checksum = crypto.createHash('md5').update(bytes).digest('hex');
  await api('PATCH', `${patchPath ?? `/v1/${type}`}/${asset.id}`, {
    data: { type, id: asset.id, attributes: { uploaded: true, sourceFileChecksum: checksum } },
  });

  return asset;
}

module.exports = { APP_ID, api, optional, uploadAsset, jwt };
