import Link from "next/link";

const ITEMS = [
  { key: "links", href: "/communication/parent-link", label: "Links" },
  { key: "send", href: "/communication/parent-link/send", label: "Send to existing families" },
  { key: "consent", href: "/communication/parent-link/consent", label: "Consent forms" },
] as const;

/** The parts of the Parent Link page. */
export function ParentLinkNav({ on }: { on: (typeof ITEMS)[number]["key"] }) {
  return (
    <nav aria-label="Parent Link" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
      {ITEMS.map((i) => (
        <Link key={i.key} href={i.href} aria-current={on === i.key ? "page" : undefined}
          className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm ${on === i.key ? "bg-brand-soft font-medium text-brand-text" : "border border-line text-ink-2 hover:bg-surface-2"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
