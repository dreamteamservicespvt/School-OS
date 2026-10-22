"use client";

import { ConfirmButton } from "@/components/ui/confirm";
import { ActionButton } from "../../action-button";
import { putBackRoleAction, roleAction } from "../actions";
import { Words } from "@/lib/i18n/client";

export function RoleSwitch({ id, name, kind, isOn, archived, people }: { id: string; name: string; kind: string; isOn: boolean; archived: boolean; people: number }) {
  if (archived) return <ActionButton label="Restore" pendingLabel="Restoring…" run={() => roleAction(id, "restore")} />;
  if (kind === "TEMPLATE") {
    return isOn
      ? (people > 0
        ? <span className="max-w-[14rem] text-sm text-ink-2"><Words k="In use by" /> {people}<Words k="; take it off them to switch it off." /></span>
        : <ConfirmButton trigger="Switch off" title={`Switch off ${name}?`} confirmLabel={`Switch off ${name}`} onConfirm={() => roleAction(id, "off")}><Words k="Nobody can be given the" /> {name} <Words k="role until it is switched on again." /></ConfirmButton>)
      : <ActionButton label="Switch on" pendingLabel="Switching on…" run={() => roleAction(id, "on")} />;
  }
  if (kind === "CUSTOM") {
    return people > 0
      ? <span className="max-w-[14rem] text-sm text-ink-2"><Words k="In use by" /> {people}<Words k="; give them another role to archive it." /></span>
      : <ConfirmButton trigger="Archive" title={`Archive ${name}?`} confirmLabel={`Archive ${name}`} onConfirm={() => roleAction(id, "archive")}><Words k="Nobody can be given this role. Its history stays, and you can restore it later." /></ConfirmButton>;
  }
  return null;
}

export function PutBack({ auditId, roleId, when }: { auditId: string; roleId: string; when: string }) {
  return (
    <ConfirmButton trigger="Put back" title="Put the role back?" confirmLabel="Put back" onConfirm={() => putBackRoleAction(auditId, roleId)}>
      <Words k="The role goes back to how it was before the change on" /> {when}<Words k=". Everyone with the role is affected. Every School Admin is told." />
    </ConfirmButton>
  );
}
