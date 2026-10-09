"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { useVersionAction } from "../actions";

export function UseVersionButton({ docType, version }: { docType: string; version: number }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger={`Use version ${version}`} title={`Use version ${version} again?`} confirmLabel={`Use version ${version}`}
      onConfirm={async () => {
        const problem = await useVersionAction(docType, version);
        if (!problem) window.location.reload();
        else router.refresh();
        return problem;
      }}>
      Documents printed from now on use version {version}. The design in use now stays in the list, so you can switch back.
    </ConfirmButton>
  );
}
