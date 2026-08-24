/* eslint-disable */
// ---------------------------------------------------------------------------
// The default deck.
//
// Every value here is INVENTED, which is why `sample: true` ships alongside it
// and every slide renders a SAMPLE DATA tag until that is turned off. Replace
// the numbers with your own and set `sample` to false; leave it true and the
// deck stays honest about what it is.
//
// `deck` is the running order. Each entry names a template and may override any
// field the template reads, so the same template can appear repeatedly with
// different content — which is how cost-per-wear becomes three slides.
// ---------------------------------------------------------------------------

window.DEFAULT_CONFIG = {
  sample: true,

  brand: { wordmark: 'ScentKeep' },

  collection: { bottles: 34, value: 2140, currency: 'USD' },

  costPerWear: [
    { name: 'Aventus', house: 'Creed', price: 445, wears: 112 },
    { name: 'Layton', house: 'Parfums de Marly', price: 320, wears: 64 },
    { name: 'Oud Wood', house: 'Tom Ford', price: 395, wears: 9 },
  ],

  sotd: {
    name: 'Bleu de Chanel',
    house: 'Chanel',
    occasion: 'Dinner',
    note: 'Sharper in the cold than I remembered. Lasted the whole night.',
  },

  mostWorn: [
    { name: 'Layton', house: 'Parfums de Marly', wears: 23 },
    { name: 'Aventus', house: 'Creed', wears: 19 },
    { name: 'Bleu de Chanel', house: 'Chanel', wears: 14 },
    { name: 'Sauvage Elixir', house: 'Dior', wears: 11 },
    { name: 'Ombré Leather', house: 'Tom Ford', wears: 7 },
  ],

  neglected: {
    days: 90,
    count: 9,
    bottles: [
      { name: 'Oud Wood', house: 'Tom Ford', lastWorn: '142d' },
      { name: 'Terre d’Hermès', house: 'Hermès', lastWorn: '128d' },
      { name: 'Fahrenheit', house: 'Dior', lastWorn: '119d' },
      { name: 'Green Irish Tweed', house: 'Creed', lastWorn: '97d' },
      { name: 'Bois d’Argent', house: 'Dior', lastWorn: '94d' },
    ],
  },

  families: [
    { name: 'Woody', percent: 32 },
    { name: 'Fresh', percent: 24 },
    { name: 'Amber', percent: 18 },
    { name: 'Fougère', percent: 14 },
    { name: 'Floral', percent: 12 },
  ],

  wishlist: [
    { name: 'Reflection Man', house: 'Amouage', note: 'Spring' },
    { name: 'Baccarat Rouge 540', house: 'MFK', note: 'Decant first' },
    { name: 'Vetiver', house: 'Guerlain', note: 'Blind buy' },
  ],

  quote: 'You do not need more bottles. You need to wear the ones you have.',

  deck: [
    { template: 'stats', theme: 'noir' },
    { template: 'costPerWear', index: 0, theme: 'paper' },
    { template: 'costPerWear', index: 2, theme: 'amber', eyebrow: 'The expensive one' },
    { template: 'mostWorn', theme: 'noir' },
    { template: 'neglected', theme: 'ink' },
    { template: 'families', theme: 'paper' },
    { template: 'sotd', theme: 'amber' },
    { template: 'wishlist', theme: 'noir' },
    { template: 'quote', theme: 'ink' },
    { template: 'outro', theme: 'noir' },
  ],
};
