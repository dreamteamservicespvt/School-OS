"use client";

// A survey's buttons: send a draft, remind those who have not answered, close, archive.
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { archiveSurveyAction, closeSurveyAction, remindSurveyAction, sendSurveyAction } from "../actions";
import { Words } from "@/lib/i18n/client";

export function SurveyButtons({ id, status, waiting, invited }: { id: string; status: string; waiting: number; invited: number | null }) {
  const router = useRouter();
  const run = (fn: (id: string) => Promise<string | void>) => async () => {
    const m = await fn(id);
    if (m) return m;
    router.refresh();
  };
  return (
    <>
      {status === "DRAFT" && (
        <ConfirmButton trigger="Send now" triggerVariant="primary" title="Send this survey?" confirmLabel={invited ? `Send to ${invited.toLocaleString("en-IN")}` : "Send survey"} onConfirm={run(sendSurveyAction)}>
          <Words k="Each person gets their own link by WhatsApp or email. After sending, the questions cannot be changed." />
        </ConfirmButton>
      )}
      {status === "OPEN" && waiting > 0 && (
        <ConfirmButton trigger="Remind" title="Remind those who have not answered?" confirmLabel={`Remind ${waiting.toLocaleString("en-IN")}`} onConfirm={run(remindSurveyAction)}>
          {waiting.toLocaleString("en-IN")} {waiting === 1 ? "person gets" : "people get"} <Words k="their link again. Those who answered get nothing." />
        </ConfirmButton>
      )}
      {status === "OPEN" && (
        <ConfirmButton trigger="Close survey" title="Close this survey?" confirmLabel="Close survey" onConfirm={run(closeSurveyAction)}>
          <Words k="No more answers are taken. The answers so far stay." />
        </ConfirmButton>
      )}
      {status !== "OPEN" && (
        <ConfirmButton trigger="Archive" triggerVariant="ghost" title="Archive this survey?" confirmLabel="Archive survey" onConfirm={async () => { const m = await archiveSurveyAction(id); if (m) return m; router.push("/communication/surveys"); }}>
          <Words k="It leaves the Surveys list." /> {status === "CLOSED" ? "Its answers are kept." : ""}
        </ConfirmButton>
      )}
    </>
  );
}
