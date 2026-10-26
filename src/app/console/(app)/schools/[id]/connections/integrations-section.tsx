// Console, a school's other connections: one card per integration, with its status,
// last check, and Connect / Change details / Test / Disconnect. Keys are never shown.
import { requireConsolePage } from "@/lib/console/current";
import { withConsoleSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { INTEGRATIONS } from "@/lib/settings/switch-rules";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IntegrationCard } from "./integration-forms";

export async function IntegrationsSection({ schoolId }: { schoolId: string }) {
  await requireConsolePage("connect");
  const data = await withConsoleSchool(schoolId, async (tx) => ({
    school: await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true } }),
    rows: await tx.integration.findMany({ where: { schoolId } }),
  }));
  if (!data.school) return null;
  const tz = data.school.timeZone;
  const connected = data.rows.filter((r) => r.status === "connected").length;
  const failing = data.rows.filter((r) => r.status === "error").length;

  return (
    <section id="other" className="scroll-mt-20" aria-label="Other connections">
      <Card>
        <CardHeader title="Other connections" description={`${connected} connected · ${failing} with an error. The school sees only each one’s status and last check, never the details or keys.`} />
        <CardBody>
          <ul className="grid gap-3 md:grid-cols-2">
            {INTEGRATIONS.map((def) => {
              const row = data.rows.find((r) => r.key === def.key);
              return (
                <IntegrationCard key={def.key} data={{
                  schoolId, def, status: row?.status ?? "not-connected", config: (row?.config ?? {}) as Record<string, string>, hasSecrets: Boolean(row?.secretsEnc),
                  lastCheck: row?.lastCheckAt ? formatDateTime(row.lastCheckAt, tz) : null, lastError: row?.lastError ?? null,
                }} />
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </section>
  );
}
