// The pages of Settings (module 20), in the order of the spec.
import { pageHidden, type DutyPerson } from "./duty";
export const SETTINGS_PAGES = [
  { href: "/settings/school-profile", label: "School Profile", about: "Name, logo, address, board, campuses, languages and school documents." },
  { href: "/settings/users", label: "Users & Permissions", about: "Logins, roles, what each role can see and approve, and sign-in rules." },
  { href: "/settings/payment-gateways", label: "Payment Gateways", about: "See which payment gateways DREAM TEAM has connected, and their status." },
  { href: "/settings/messaging", label: "SMS, WhatsApp & Email", about: "Switch WhatsApp, SMS and email on or off, and see credits. DREAM TEAM connects them." },
  { href: "/settings/document-designs", label: "Document Designs", about: "Receipts, certificates, ID cards and report cards with your logo." },
  { href: "/settings/forms-approvals", label: "Forms & Approvals", about: "Extra fields on forms, and who approves what up to which amount." },
  { href: "/settings/modules", label: "Modules On/Off", about: "Switch modules on or off, AI features and integrations." },
  { href: "/settings/data-security", label: "Data Backup & Security", about: "Backups, imports, exports, the audit log, privacy and consent." },
] as const;

/** Settings pages the person's roles look after: the Principal leaves gateways, message channels and backups to the School Admin (src/lib/duty.ts). */
export function settingsPagesFor(person: DutyPerson) {
  return SETTINGS_PAGES.filter((p) => !pageHidden(person, "settings", p.href.split("/")[2]));
}
