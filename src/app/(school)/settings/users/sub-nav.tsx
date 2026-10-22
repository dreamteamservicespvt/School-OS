import Link from "next/link";

/** Users & Permissions has three parts: the people with a login, the roles, and the password and session rules. */
export function UsersNav({ active }: { active: "users" | "roles" | "rules" }) {
  const item = (key: "users" | "roles" | "rules", href: string, label: string) => (
    <Link href={href} aria-current={active === key ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-lg px-4 font-medium ${active === key ? "bg-brand-soft text-brand-text" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Users and roles" className="mb-4 flex flex-wrap gap-1">
      {item("users", "/settings/users", "Users")}
      {item("roles", "/settings/users/roles", "Roles")}
      {item("rules", "/settings/users/sign-in-rules", "Password and session rules")}
    </nav>
  );
}
