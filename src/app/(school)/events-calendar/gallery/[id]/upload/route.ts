// Upload photos and videos into an album (Gallery). The role is checked on the
// server like every other change: requireAction("create") and the Events
// level that keeps the gallery; the files are saved inside the school's walls
// and one audit line says how many went in.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { EventsProblem, inEvents, need, problemState, UUID_RE } from "@/lib/events/act";
import { addMedia, uploaded } from "@/lib/events/gallery";

const MAX_FILES = 40;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ message: "This album was not found." }, { status: 404 });
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ message: "The files could not be read. Try again." }, { status: 400 });
  }
  const files = fd.getAll("files").filter((f): f is File => typeof f !== "string");
  try {
    const r = await inEvents("create", async (w) => {
      need(w.can.gallery, "upload photos");
      if (!files.length) throw new EventsProblem("Choose photos or videos to upload.");
      if (files.length > MAX_FILES) throw new EventsProblem(`Upload at most ${MAX_FILES} files at a time.`);
      let photos = 0;
      let videos = 0;
      for (const f of files) {
        const m = await addMedia(w.tx, w.ctx, id, f);
        if (m.kind === "VIDEO") videos++;
        else photos++;
      }
      await uploaded(w.tx, w.ctx, id, photos, videos);
      return { photos, videos };
    });
    revalidatePath(`/events-calendar/gallery/${id}`);
    const words = [r.photos ? `${r.photos} ${r.photos === 1 ? "photo" : "photos"}` : "", r.videos ? `${r.videos} ${r.videos === 1 ? "video" : "videos"}` : ""].filter(Boolean).join(" and ");
    return NextResponse.json({ message: `${words} uploaded. Tag the students in them; until then they stay staff only.`, ...r });
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // sign-in redirects
    const s = problemState(e);
    return NextResponse.json({ message: s.message }, { status: 400 });
  }
}
