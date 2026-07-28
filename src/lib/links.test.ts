import { AUTO_RENEW_TERMS, LINKS, SITE_BASE } from './links';

describe('outbound links', () => {
  it('every link is an absolute https URL', () => {
    // A relative or http URL in App Store Connect is a straight rejection, and
    // a typo here is invisible until a reviewer clicks it.
    for (const [name, url] of Object.entries(LINKS)) {
      expect(`${name}: ${url}`).toMatch(/: https:\/\//);
      expect(() => new URL(url)).not.toThrow();
    }
  });

  it('privacy, terms and support all live on the site we actually deployed', () => {
    for (const url of [LINKS.privacy, LINKS.terms, LINKS.support, LINKS.home]) {
      expect(url.startsWith(SITE_BASE)).toBe(true);
    }
  });

  it('exposes the three URLs App Review requires', () => {
    expect(LINKS.privacy).toBeTruthy();
    expect(LINKS.terms).toBeTruthy();
    expect(LINKS.support).toBeTruthy();
  });

  it('points at the real store subscription-management pages', () => {
    expect(LINKS.manageSubscriptionsIos).toContain('apple.com');
    expect(LINKS.manageSubscriptionsAndroid).toContain('play.google.com');
  });
});

describe('auto-renew disclosure (guideline 3.1.2)', () => {
  it('states every element Apple requires', () => {
    const t = AUTO_RENEW_TERMS.toLowerCase();
    expect(t).toContain('charged');
    expect(t).toContain('renews automatically');
    expect(t).toContain('24 hours');
    expect(t).toContain('cancel');
    expect(t).toContain('account settings');
  });

  it('is substantial enough to be a real disclosure, not a stub', () => {
    expect(AUTO_RENEW_TERMS.length).toBeGreaterThan(200);
  });
});
