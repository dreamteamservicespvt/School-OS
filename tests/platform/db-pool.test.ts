// The database pool under load (layman tests LA5, LC3, LE9): a pool size and a wait
// for a free connection are added when DATABASE_URL names none, and a "busy" error
// carries a digest so the error page says "busy, try again" instead of "could not open".
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { BUSY_DIGEST, databaseUrl, markBusy, poolLimit } from "@/lib/db";

describe("databaseUrl", () => {
  it("adds a pool size and wait when the address has none", () => {
    const u = new URL(databaseUrl("postgresql://u:p@localhost:5432/school", {} as NodeJS.ProcessEnv)!);
    expect(u.searchParams.get("connection_limit")).toBe("20");
    expect(u.searchParams.get("pool_timeout")).toBe("20");
    expect(poolLimit(databaseUrl("postgresql://u:p@localhost/school", { VERCEL: "1" } as unknown as NodeJS.ProcessEnv))).toBe(5);
  });

  it("keeps what DATABASE_URL already says", () => {
    const u = new URL(databaseUrl("postgresql://u:p@db.example/school?connection_limit=3&pool_timeout=5&sslmode=require", { VERCEL: "1" } as unknown as NodeJS.ProcessEnv)!);
    expect(u.searchParams.get("connection_limit")).toBe("3");
    expect(u.searchParams.get("pool_timeout")).toBe("5");
    expect(u.searchParams.get("sslmode")).toBe("require");
    expect(u.password).toBe("p");
    expect(databaseUrl("", {} as NodeJS.ProcessEnv)).toBeUndefined();
  });
});

describe("markBusy", () => {
  const known = (code: string) => new Prisma.PrismaClientKnownRequestError("busy", { code, clientVersion: "6" });

  it.each(["P2024", "P2028", "P2034"])("gives %s the busy digest", (code) => {
    const e = known(code);
    expect(() => markBusy(e)).toThrow(e);
    expect((e as unknown as { digest: string }).digest).toBe(`${BUSY_DIGEST}${code}`);
  });

  it("leaves other errors alone", () => {
    const e = known("P2002");
    expect(() => markBusy(e)).toThrow(e);
    expect("digest" in e).toBe(false);
    const plain = new Error("x");
    expect(() => markBusy(plain)).toThrow(plain);
    expect("digest" in plain).toBe(false);
  });
});
