import 'react-native-get-random-values';

/**
 * RFC-4122 v4 UUID.
 *
 * React Native has no `crypto.randomUUID`, so this builds one from
 * `crypto.getRandomValues` (polyfilled by react-native-get-random-values).
 * Ids are generated client-side so a bottle gets a stable identity the moment
 * it is created — before any network round-trip — which is what makes the
 * offline-first write path and later sync-by-id work.
 */
export function newId(): string {
  const bytes = new Uint8Array(16);

  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    // Last-resort fallback (should never run on device or in jest-expo, both of
    // which provide getRandomValues). Keeps id generation total rather than
    // throwing and taking a screen down with it.
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) hex.push(bytes[i].toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
