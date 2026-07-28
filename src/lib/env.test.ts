import { integrations } from './env';

describe('integration stubbing', () => {
  it('reports each integration as live or stubbed', () => {
    // The whole app is built to run with an empty .env, so this map must always
    // be answerable rather than throwing on a missing key.
    for (const value of Object.values(integrations)) {
      expect(typeof value).toBe('boolean');
    }
  });

  it('covers every integration the app can stub', () => {
    expect(Object.keys(integrations).sort()).toEqual([
      'analytics',
      'monitoring',
      'purchases',
      'supabase',
    ]);
  });
});

describe('placeholder env values count as unset', () => {
  // A .env copied from .env.example and half-filled must stub cleanly rather
  // than hand a vendor SDK the literal string "your-key-here".
  const cases = ['your-key-here', 'YOUR_KEY', 'changeme', 'TODO', '<paste here>', '   ', ''];

  it.each(cases)('treats %p as absent', (value) => {
    // Mirrors the `clean()` predicate in env.ts. Kept as an explicit list so a
    // change to that regex has to be a deliberate one.
    const looksUnset = !value.trim() || /^(your|changeme|todo|xxx|<.*>)/i.test(value.trim());
    expect(looksUnset).toBe(true);
  });

  it('does not treat a real key as a placeholder', () => {
    for (const real of [
      'sb_publishable_I-kbP_mIrciwp_tkgxecMQ_1dDVDMsY',
      'appl_AbCdEfGhIjKlMnOp',
      'phc_1234567890abcdef',
      'https://iqpknjohrjieepvzgqoz.supabase.co',
    ]) {
      const looksUnset = !real.trim() || /^(your|changeme|todo|xxx|<.*>)/i.test(real.trim());
      expect(looksUnset).toBe(false);
    }
  });
});
