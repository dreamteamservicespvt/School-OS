"use server";

// Answers from a survey link (no login). The token is checked on the server inside the school's
// walls, and each person can answer once.
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { submitAnswers, SurveyProblem } from "@/lib/communication/surveys";

const uuid = /^[0-9a-f-]{36}$/;

export async function submitSurveyAction(schoolId: string, token: string, raw: Record<string, string>): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!uuid.test(schoolId)) return { ok: false, message: "This link does not work." };
  const device = await deviceInfo();
  const limited = await hitLimit(`survey-answer:ip:${device.ipAddress ?? "unknown"}`, 30, 600);
  if (!limited.ok) return { ok: false, message: limitMessage(limited) };
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw ?? {}).slice(0, 40)) if (uuid.test(k)) answers[k] = String(v ?? "").slice(0, 1000);
  try {
    await withSchool({ schoolId, userId: null }, async (tx) => {
      const school = await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true } });
      if (!school) throw new SurveyProblem("This link does not work.");
      await submitAnswers(tx, { schoolId, userId: null }, token, answers, school.timeZone);
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof SurveyProblem) return { ok: false, message: e.message };
    throw e;
  }
}
