import { makeFragrance } from './fixtures';
import { buildSotdCard, sotdCardText } from './sotdCard';

describe('buildSotdCard', () => {
  it('puts the bottle name and house on the card', () => {
    const card = buildSotdCard(
      makeFragrance({ id: 'f1', name: 'Tobacco Vanille', brand: 'Tom Ford', family: 'Gourmand' }),
    )!;
    expect(card.name).toBe('Tobacco Vanille');
    expect(card.house).toBe('Tom Ford');
    expect(card.detail).toBe('Gourmand');
  });

  it('passes a photo through when the bottle already has one', () => {
    const card = buildSotdCard(
      makeFragrance({ id: 'f1', name: 'Sauvage', brand: 'Dior', photoUrl: 'file://bottle.jpg' }),
    )!;
    expect(card.photoUrl).toBe('file://bottle.jpg');
  });

  it('leaves the photo empty rather than inventing one', () => {
    const card = buildSotdCard(makeFragrance({ id: 'f1', name: 'Sauvage', brand: 'Dior' }))!;
    expect(card.photoUrl).toBeNull();
  });

  it('refuses a missing bottle', () => {
    expect(buildSotdCard(undefined)).toBeNull();
    expect(buildSotdCard(null)).toBeNull();
  });

  it('refuses a wishlist bottle -- this is what is on skin, not what is hunted', () => {
    expect(
      buildSotdCard(makeFragrance({ id: 'w', name: 'Baccarat Rouge 540', brand: 'MFK', inWishlist: true })),
    ).toBeNull();
  });

  it('refuses a bottle with no name', () => {
    expect(buildSotdCard(makeFragrance({ id: 'f1', name: '   ', brand: 'Dior' }))).toBeNull();
  });

  it('never puts a price, date, or diary field on the card', () => {
    // The one rule that matters. A SOTD photo with what it cost, when it was
    // bought, or a private note is not a card anyone should post.
    const fragrance = makeFragrance({
      id: 'f1',
      name: 'Aventus',
      brand: 'Creed',
      family: 'Chypre',
      price: 445,
      currency: 'USD',
      purchaseDate: '2024-11-02',
      notes: 'gift from Sam, keep private',
      createdAt: '2024-11-02T09:00:00.000Z',
      updatedAt: '2026-09-02T12:00:00.000Z',
    });
    const card = buildSotdCard(fragrance)!;
    const text = sotdCardText(card);
    expect(text).toBe('Aventus Creed Chypre');
    expect(text).not.toMatch(/445|USD|\$|2024|2026|Sam|private|gift/);
    expect(JSON.stringify(card)).not.toMatch(/445|USD|\$|2024-11-02|gift from Sam/);
  });

  it('does not invent a third line when there is no family', () => {
    const card = buildSotdCard(makeFragrance({ id: 'f1', name: 'Sauvage', brand: 'Dior', family: null }))!;
    expect(card.detail).toBe('');
    expect(sotdCardText(card)).toBe('Sauvage Dior');
  });

  it('keeps an empty house rather than a placeholder', () => {
    const card = buildSotdCard(makeFragrance({ id: 'f1', name: 'House Blend', brand: '' }))!;
    expect(card.house).toBe('');
    expect(sotdCardText(card)).not.toMatch(/unknown/);
  });
});