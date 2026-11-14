// The words on /no-access (main.jsx NoAccess). Three cases:
// the module is switched off for the school; the person's roles do not include
// the module at all (it is not in their menu); or they have part of the module
// (for example "Own" reach) but not the page they opened, so the page names
// the parts they can use.

export type NoAccessCase = "off" | "not-in-menu" | "not-this-page";

/** `turnsOn`: the person may change Settings, Modules On/Off, so they are told to switch it on themselves. */
export function noAccessWords(o: { name: string; schoolName: string; roles: string; off: boolean; hasModule: boolean; pages?: string[]; turnsOn?: boolean }): { kind: NoAccessCase; title: string; body: string } {
  if (o.off) {
    return { kind: "off", title: `${o.name} is switched off for ${o.schoolName}`, body: `${o.turnsOn ? "Switch it on" : "The School Admin can switch it on"} in Settings, Modules On/Off. Nothing is lost while it is off.` };
  }
  if (!o.hasModule) {
    return { kind: "not-in-menu", title: `${o.name} is not in your menu`, body: `Your login cannot open ${o.name}. If you need it for your work, ask the School Admin to give you access.` };
  }
  const pages = (o.pages ?? []).filter(Boolean);
  return {
    kind: "not-this-page",
    title: `Your login cannot open this page of ${o.name}`,
    body: pages.length
      ? `You can use: ${pages.join(", ")}. If you need this page for your work, ask the School Admin to give you access.`
      : `You can use the other pages of ${o.name} in your menu. If you need this page for your work, ask the School Admin to give you access.`,
  };
}
