"use server";

// The online admission form's actions (no login). Each one finds the school
// from its code again and is rate-limited by address (08-platform-security.md §7).
import { redirect } from "next/navigation";
import { deviceInfo } from "@/lib/current";
import { formValues, type FormState } from "@/lib/forms";
import { checkMobile, need, problemState, str } from "@/lib/admission/act";
import { readApplicationForm } from "@/lib/admission/application-form";
import { DATA_CONSENT, otpSentWords } from "@/lib/admission/consent";
import { checkOnlineCode, schoolByCode, sendOnlineCode, submitOnline } from "@/lib/admission/public";

const CLOSED = "This admission form was not found. Please check the link with the school.";

export async function sendApplyCodeAction(code: string, phone: string): Promise<{ ok: boolean; message: string }> {
  const school = await schoolByCode(code);
  if (!school) return { ok: false, message: CLOSED };
  try {
    const to = checkMobile(phone.replace(/\D/g, "").slice(-10), "phone", "Mobile number");
    const r = await sendOnlineCode(school.id, to, (await deviceInfo()).ipAddress);
    return { ok: true, message: otpSentWords(r, r.sentTo) };
  } catch (e) {
    return { ok: false, message: problemState(e).message ?? "The code could not be sent." };
  }
}

export async function checkApplyCodeAction(code: string, phone: string, otp: string): Promise<{ ok: boolean; message: string }> {
  const school = await schoolByCode(code);
  if (!school) return { ok: false, message: CLOSED };
  try {
    const to = checkMobile(phone.replace(/\D/g, "").slice(-10), "phone", "Mobile number");
    const r = await checkOnlineCode(school.id, to, otp, (await deviceInfo()).ipAddress);
    return r.ok ? { ok: true, message: "Mobile number confirmed." } : r;
  } catch (e) {
    return { ok: false, message: problemState(e).message ?? "The code could not be checked." };
  }
}

export async function submitApplyAction(code: string, _: FormState<unknown>, fd: FormData): Promise<FormState<unknown>> {
  const school = await schoolByCode(code);
  if (!school) return { ok: false, message: CLOSED };
  let path: string;
  try {
    const consentTypes = fd.getAll("consent").map(String).filter((t) => /^[a-z-]{2,40}$/.test(t));
    let givenByName = "";
    // Every problem at once, the consent and the sender's name included (PEOPLE-07).
    const input = readApplicationForm(fd, {
      restricted: false,
      extra: (c) => {
        givenByName = c.take(() => need(fd, "givenByName", "Your name", 120), "");
        if (!consentTypes.includes(DATA_CONSENT)) c.add("consent", "Please agree to the use of your child's data. The school needs it to process the admission.");
      },
    });
    const r = await submitOnline(school.id, {
      ...input,
      consentTypes,
      givenByName,
      code: str(fd, "code"),
      heardFrom: str(fd, "heardFrom") || null,
    }, (await deviceInfo()).ipAddress);
    path = `/apply/${encodeURIComponent(code)}/status/${r.id}?t=${r.token}&new=1`;
  } catch (e) {
    return problemState(e, fd);
  }
  redirect(path);
}
