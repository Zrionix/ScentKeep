// ---------------------------------------------------------------------------
// ScentKeep design tokens — "Noir & Gilt".
//
// One token system, themed for dark (default) and light. Every component reads
// from here; nothing hard-codes a hex. Swapping a theme restyles the whole app,
// and dark mode is first-class rather than bolted on.
//
// Aesthetic brief (§4): elegant, tactile, "luxury minimal". Warm near-black
// grounds, a single champagne-gold accent, ivory type, generous whitespace.
// ---------------------------------------------------------------------------

export type ThemeName = 'dark' | 'light';

export interface Palette {
  /** Page background — the deepest surface. */
  bg: string;
  /** Card / raised surface. */
  surface: string;
  /** Inset or secondary surface (inputs, chips, wells). */
  surface2: string;
  /** Pressed / hovered surface. */
  surface3: string;

  /** Primary text. */
  ink: string;
  /** Secondary text. */
  ink2: string;
  /** Tertiary / meta text. */
  ink3: string;
  /** Faintest text — placeholders, disabled. */
  ink4: string;

  /** Hairline borders. */
  line: string;
  /** Even fainter divider. */
  lineSoft: string;

  /** The single brand accent — champagne gold. */
  accent: string;
  /** Text/icon color that sits ON the accent. */
  accentInk: string;
  /** Translucent accent wash for chips, selected states. */
  accentBg: string;
  /** Accent at low emphasis, for borders on selected items. */
  accentLine: string;

  /** Status colors. */
  positive: string;
  positiveBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;

  /** Shadow color for elevated cards. */
  shadow: string;
  /** Scrim behind modals / sheets. */
  scrim: string;
}

const dark: Palette = {
  bg: '#0B0A0C',
  surface: '#141216',
  surface2: '#1C191E',
  surface3: '#252128',

  ink: '#F5F1EA',
  ink2: '#B8B1A7',
  ink3: '#867E75',
  ink4: '#5A544D',

  line: 'rgba(245, 241, 234, 0.09)',
  lineSoft: 'rgba(245, 241, 234, 0.05)',

  accent: '#C9A961',
  accentInk: '#17130A',
  accentBg: 'rgba(201, 169, 97, 0.13)',
  accentLine: 'rgba(201, 169, 97, 0.38)',

  positive: '#7FB069',
  positiveBg: 'rgba(127, 176, 105, 0.14)',
  warning: '#D9A441',
  warningBg: 'rgba(217, 164, 65, 0.14)',
  danger: '#D9695F',
  dangerBg: 'rgba(217, 105, 95, 0.14)',

  shadow: 'rgba(0, 0, 0, 0.55)',
  scrim: 'rgba(6, 5, 7, 0.72)',
};

const light: Palette = {
  bg: '#FAF7F2',
  surface: '#FFFFFF',
  surface2: '#F2EDE5',
  surface3: '#E9E2D7',

  ink: '#1A1719',
  ink2: '#4E4844',
  ink3: '#7A736C',
  ink4: '#A79F96',

  line: 'rgba(26, 23, 25, 0.10)',
  lineSoft: 'rgba(26, 23, 25, 0.06)',

  // Darkened gold so accent-on-ivory clears WCAG AA for text (§4 accessibility).
  accent: '#8A6B24',
  accentInk: '#FFFFFF',
  accentBg: 'rgba(138, 107, 36, 0.10)',
  accentLine: 'rgba(138, 107, 36, 0.34)',

  positive: '#4A7A34',
  positiveBg: 'rgba(74, 122, 52, 0.12)',
  warning: '#9A6B12',
  warningBg: 'rgba(154, 107, 18, 0.12)',
  danger: '#A93F35',
  dangerBg: 'rgba(169, 63, 53, 0.12)',

  shadow: 'rgba(58, 46, 30, 0.14)',
  scrim: 'rgba(26, 23, 25, 0.45)',
};

export const palettes: Record<ThemeName, Palette> = { dark, light };

// --- Spacing -----------------------------------------------------------------
// 4pt base. Generous by default — whitespace is the main luxury signal.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// --- Radii -------------------------------------------------------------------
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

// --- Typography --------------------------------------------------------------
// Display face is a serif (editorial / fragrance-counter feel); UI text is the
// platform sans. `display` resolves to the bundled Cormorant Garamond once
// loaded, falling back to a platform serif so text never renders invisible.
export const fontFamily = {
  display: 'CormorantGaramond_600SemiBold',
  displayFallback: 'serif',
  body: undefined as string | undefined, // platform default sans
} as const;

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  fontWeight?:
    | 'normal'
    | 'bold'
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900';
  textTransform?: 'none' | 'uppercase';
  fontFamily?: string;
}

export const type = {
  /** Screen-defining serif headline, e.g. "My Wardrobe". */
  display: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 0.2,
    fontWeight: '600',
    fontFamily: fontFamily.display,
  },
  /** Large serif, e.g. a bottle name on its detail screen. */
  title: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 0.1,
    fontWeight: '600',
    fontFamily: fontFamily.display,
  },
  /** Section heading. */
  heading: { fontSize: 19, lineHeight: 25, letterSpacing: 0.1, fontWeight: '600' },
  /** Card / list-row title. */
  subtitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  /** Default reading text. */
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  /** Supporting text. */
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Meta / timestamps. */
  caption: { fontSize: 11.5, lineHeight: 16, fontWeight: '500' },
  /** Letterspaced uppercase eyebrow — the main "considered" typographic move. */
  overline: {
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.5,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  /** Big numeral for stat tiles. */
  stat: {
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.4,
    fontWeight: '600',
    fontFamily: fontFamily.display,
  },
} satisfies Record<string, TypeStyle>;

// --- Elevation ---------------------------------------------------------------
export function cardShadow(p: Palette) {
  return {
    shadowColor: p.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  } as const;
}

// --- Motion ------------------------------------------------------------------
// Subtle by design (§4). `reduced` is substituted when the OS asks for less
// motion, so every animation has a no-motion fallback rather than being removed.
export const motion = {
  fast: 140,
  base: 240,
  slow: 420,
  reduced: 0,
} as const;

// --- Scent families ----------------------------------------------------------
// One restrained hue per olfactory family. Used for tags, the wardrobe grid
// accent, and the stats breakdown chart — never invented ad hoc per screen.
export const SCENT_FAMILIES = [
  'Floral',
  'Woody',
  'Fresh',
  'Citrus',
  'Amber',
  'Aquatic',
  'Gourmand',
  'Fougère',
  'Chypre',
  'Green',
  'Spicy',
  'Leather',
] as const;

export type ScentFamily = (typeof SCENT_FAMILIES)[number];

export const familyColor: Record<ScentFamily, string> = {
  Floral: '#D98BA8',
  Woody: '#A9784C',
  Fresh: '#8FBFA8',
  Citrus: '#D6B44A',
  Amber: '#C9762F',
  Aquatic: '#5B9AA9',
  Gourmand: '#B07156',
  Fougère: '#6E8C6B',
  Chypre: '#8A7BA8',
  Green: '#7FA05C',
  Spicy: '#BC5F4A',
  Leather: '#8C6A55',
};

/** Families are user-editable free text too; unknown values get a neutral hue. */
export function colorForFamily(family: string | null | undefined, p: Palette): string {
  if (!family) return p.ink4;
  return familyColor[family as ScentFamily] ?? p.ink3;
}

// --- Seasons & occasions -----------------------------------------------------
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];

export const OCCASIONS = [
  'Daily',
  'Work',
  'Evening',
  'Date',
  'Formal',
  'Gym',
  'Travel',
  'Special',
] as const;
export type Occasion = (typeof OCCASIONS)[number];
