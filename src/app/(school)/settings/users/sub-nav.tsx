import Link from "next/link";

/** Users & Permissions has two parts: the people with a login, and the roles. */
export function UsersNav({ active }: { active: "users" | "roles" }) {
  const item = (key: "users" | "roles", href: string, label: string) => (
    <Link href={href} aria-current={active === key ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-lg px-4 font-medium ${active === key ? "bg-brand-soft text-brand-text" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Users and roles" className="mb-4 flex gap-1">
      {item("users", "/settings/users", "Users")}
      {item("roles", "/settings/users/roles", "Roles")}
    </nav>
  );
}
