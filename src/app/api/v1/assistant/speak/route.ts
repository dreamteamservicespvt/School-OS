import { getCurrent } from "@/lib/current";
import { hitLimit } from "@/lib/rate-limit";
import { speakReply } from "@/lib/assistant/speak";

export const dynamic = "force-dynamic";

/** Spoken replies one person may ask for in a minute (the school's speech limit applies on top). */
const SPEAK_PER_MINUTE = 30;

/** The request came from this site's own page (a JSON body cannot be sent cross-site without the browser asking first). */
function sameSite(req: Request): boolean {
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const from = new URL(origin).host;
    const hosts = [new URL(req.url).host, req.headers.get("host"), req.headers.get("x-forwarded-host")].filter(Boolean);
    return hosts.includes(from);
  } catch { return false; }
}

const NO_STORE = { "cache-control": "no-store, private" };

/**
 * The School OS Assistant's AI voice (src/lib/assistant/speak.ts): one reply
 * from the person's own conversation, said aloud with its feeling, as
 * audio/wav. 204 (no audio) when the voice is not connected or cannot answer,
 * so the panel speaks with the browser's own voice instead.
 */
export async function POST(req: Request) {
  const current = await getCurrent();
  if (!current) return Response.json({ problem: "Sign in first." }, { status: 401, headers: NO_STORE });
  if (!sameSite(req)) return Response.json({ problem: "Not allowed." }, { status: 403, headers: NO_STORE });
  if (!(await hitLimit(`assistant-speak:${current.user.id}`, SPEAK_PER_MINUTE, 60)).ok) return new Response(null, { status: 204, headers: NO_STORE });
  const body = await req.json().catch(() => null);
  const r = await speakReply(current, body && typeof body === "object" ? body : null);
  if (r.status === 200) {
    return new Response(r.wav as Uint8Array<ArrayBuffer>, { status: 200, headers: { ...NO_STORE, "content-type": "audio/wav", "content-length": String(r.wav.byteLength) } });
  }
  if (r.status === 204) return new Response(null, { status: 204, headers: NO_STORE });
  return Response.json({ problem: r.problem }, { status: r.status, headers: NO_STORE });
}
