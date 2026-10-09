// The pages of Settings (module 20), in the order of the spec.
export const SETTINGS_PAGES = [
  { href: "/settings/school-profile", label: "School Profile", about: "Name, logo, address, board, campuses, languages and school documents." },
  { href: "/settings/users", label: "Users & Permissions", about: "Logins, roles, what each role can see and approve, and sign-in rules." },
  { href: "/settings/payment-gateways", label: "Payment Gateways", about: "Connect Razorpay and other gateways, and test them." },
  { href: "/settings/messaging", label: "SMS, WhatsApp & Email", about: "Connect message channels, DLT details and credits." },
  { href: "/settings/document-designs", label: "Document Designs", about: "Receipts, certificates, ID cards and report cards with your logo." },
  { href: "/settings/forms-approvals", label: "Forms & Approvals", about: "Extra fields on forms, and who approves what up to which amount." },
  { href: "/settings/modules", label: "Modules On/Off", about: "Switch modules on or off, AI features and integrations." },
  { href: "/settings/data-security", label: "Data Backup & Security", about: "Backups, imports, exports, the audit log, privacy and consent." },
] as const;
