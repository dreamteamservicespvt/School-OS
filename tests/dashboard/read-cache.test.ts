// Dashboard speed (15 Nov): one Dashboard transaction asked the same reads up to 12 times.
// cachedReads asks an identical model read once per transaction, forgets everything on any
// write, hands each caller its own copy, and never keeps raw SQL. A stand-in transaction
// counts the calls, so this needs no database.
import { describe, expect, it } from "vitest";
import { cachedReads } from "@/lib/dashboard/read-cache";
import type { Tx } from "@/lib/db";

function fakeTx() {
  const calls: string[] = [];
  const rows = () => [{ id: "a", when: new Date("2026-11-15T00:00:00Z"), list: [1, 2] }];
  const tx = {
    campus: {
      findMany: (args: unknown) => { calls.push(`findMany ${JSON.stringify(args)}`); return Promise.resolve(rows()); },
      count: () => { calls.push("count"); return Promise.resolve(3); },
      update: () => { calls.push("update"); return Promise.resolve({}); },
    },
    $queryRaw: () => { calls.push("raw"); return Promise.resolve([{ n: 1 }]); },
    $executeRaw: () => { calls.push("exec"); return Promise.resolve(1); },
  };
  return { tx: cachedReads(tx as unknown as Tx) as unknown as typeof tx, calls };
}

describe("dashboard read cache", () => {
  it("asks an identical read once and a different one again", async () => {
    const { tx, calls } = fakeTx();
    await tx.campus.findMany({ where: { archivedAt: null } });
    await tx.campus.findMany({ where: { archivedAt: null } });
    await tx.campus.findMany({ where: { name: "North" } });
    await tx.campus.count();
    await tx.campus.count();
    expect(calls).toEqual([`findMany {"where":{"archivedAt":null}}`, `findMany {"where":{"name":"North"}}`, "count"]);
  });

  it("forgets everything after a model write or $executeRaw, so later reads see the change", async () => {
    const { tx, calls } = fakeTx();
    await tx.campus.count();
    await tx.campus.update();
    await tx.campus.count();
    await tx.$executeRaw();
    await tx.campus.count();
    expect(calls.filter((c) => c === "count")).toHaveLength(3);
  });

  it("gives each caller its own copy (dates and nested arrays too)", async () => {
    const { tx } = fakeTx();
    const a = await tx.campus.findMany({});
    a[0].list.push(99);
    a[0].when.setUTCFullYear(2000);
    const b = await tx.campus.findMany({});
    expect(b[0].list).toEqual([1, 2]);
    expect(b[0].when.getUTCFullYear()).toBe(2026);
  });

  it("never keeps raw SQL", async () => {
    const { tx, calls } = fakeTx();
    await tx.$queryRaw();
    await tx.$queryRaw();
    expect(calls.filter((c) => c === "raw")).toHaveLength(2);
  });

  it("does not keep reads whose arguments hold non-plain objects", async () => {
    const { tx, calls } = fakeTx();
    class Odd { v = 1; }
    await tx.campus.findMany({ where: { x: new Odd() } });
    await tx.campus.findMany({ where: { x: new Odd() } });
    expect(calls).toHaveLength(2);
  });
});
