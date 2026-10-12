// Appearance: light, dark or follow the device, a school colour and the text size.
// Kept in cookies so the first paint already has the right colours, and on
// the User Login so it follows the person to a new device.

export const THEMES = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "Auto" },
] as const;

// The six colours of the approved design. `swatch` is the light-mode colour, `dark` the dark-mode one.
export const ACCENTS = [
  { key: "lagoon", label: "Lagoon", swatch: "rgb(12 112 100)", dark: "rgb(52 196 174)" },
  { key: "royal", label: "Royal", swatch: "rgb(37 88 216)", dark: "rgb(118 158 255)" },
  { key: "plum", label: "Plum", swatch: "rgb(122 52 186)", dark: "rgb(192 146 252)" },
  { key: "saffron", label: "Saffron", swatch: "rgb(184 88 6)", dark: "rgb(248 168 72)" },
  { key: "rose", label: "Rose", swatch: "rgb(190 28 78)", dark: "rgb(255 120 156)" },
  { key: "graphite", label: "Graphite", swatch: "rgb(46 60 78)", dark: "rgb(190 204 222)" },
] as const;

export const TEXT_SIZES = [
  { key: "normal", label: "Normal" },
  { key: "large", label: "Large" },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];
export type AccentKey = (typeof ACCENTS)[number]["key"];
export type TextSizeKey = (typeof TEXT_SIZES)[number]["key"];

/** The look a new person starts with: light, with Royal blue (decided by the school owner, 12 October 2026). */
export const DEFAULT_THEME: ThemeKey = "light";
export const DEFAULT_ACCENT: AccentKey = "royal";

export const THEME_COOKIE = "sos_theme";
export const ACCENT_COOKIE = "sos_accent";
export const SIZE_COOKIE = "sos_size";

// Colours from the first design, kept working for anyone who chose one.
const OLD_ACCENTS: Record<string, AccentKey> = { blue: "royal", teal: "lagoon", violet: "plum", amber: "saffron", green: "lagoon" };

export function cleanTheme(value: string | undefined | null): ThemeKey {
  return THEMES.some((t) => t.key === value) ? (value as ThemeKey) : DEFAULT_THEME;
}

export function cleanAccent(value: string | undefined | null): AccentKey {
  if (ACCENTS.some((a) => a.key === value)) return value as AccentKey;
  return (value && OLD_ACCENTS[value]) || DEFAULT_ACCENT;
}

export function cleanTextSize(value: string | undefined | null): TextSizeKey {
  return value === "large" ? "large" : "normal";
}
