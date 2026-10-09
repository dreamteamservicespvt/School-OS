// Appearance: light, dark or follow the device, and an accent colour.
// Kept in a cookie so the first paint already has the right colours, and on
// the User Login so it follows the person to a new device.

export const THEMES = [
  { key: "system", label: "Same as this device" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
] as const;

export const ACCENTS = [
  { key: "blue", label: "Blue", swatch: "#1d4ed8" },
  { key: "teal", label: "Teal", swatch: "#0f766e" },
  { key: "violet", label: "Violet", swatch: "#6d28d9" },
  { key: "rose", label: "Rose", swatch: "#be123c" },
  { key: "amber", label: "Amber", swatch: "#b45309" },
  { key: "green", label: "Green", swatch: "#15803d" },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];
export type AccentKey = (typeof ACCENTS)[number]["key"];

export const THEME_COOKIE = "sos_theme";
export const ACCENT_COOKIE = "sos_accent";

export function cleanTheme(value: string | undefined | null): ThemeKey {
  return THEMES.some((t) => t.key === value) ? (value as ThemeKey) : "system";
}

export function cleanAccent(value: string | undefined | null): AccentKey {
  return ACCENTS.some((a) => a.key === value) ? (value as AccentKey) : "blue";
}
