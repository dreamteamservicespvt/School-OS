"use client";

// Upload or replace the student's photo, from the camera or a file (03 §2).

import { useActionState, useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

export function PhotoUpload({ action, remove, hasPhoto, name, children }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  remove?: (fd: FormData) => Promise<string | void>;
  hasPhoto: boolean;
  name: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const router = useRouter();
  const [state, formAction] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    if (r?.ok) { setOpen(false); setPreview(null); router.refresh(); }
    return r;
  }, null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative rounded-full" aria-label={hasPhoto ? `Change ${name}'s photo` : `Add a photo of ${name}`}>
        {children}
        <span className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border border-line bg-surface text-ink2 shadow-card group-hover:bg-sunken group-hover:text-ink" aria-hidden="true"><Camera size={15} /></span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={hasPhoto ? "Replace photo" : "Add photo"}>
        <form action={formAction} className="space-y-4">
          <FormMessage state={state && !state.ok ? state : null} />
          <div>
            <label htmlFor="student-photo" className="mb-1 block text-[13px] font-semibold text-ink2">Photo</label>
            <input id="student-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required
              onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }}
              className="block w-full rounded-xl border border-line bg-surface p-2 text-base file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-brand/10 file:px-3 file:text-brand" />
            <p className="mt-1 text-[13.5px] text-ink2">On a phone you can take the photo with the camera. JPG or PNG, up to 10 MB; it is made smaller for phones.</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview before upload */}
          {preview && <img src={preview} alt="The chosen photo" className="mx-auto size-40 rounded-full border border-line object-cover" />}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Saving…">Save photo</SubmitButton>
            {hasPhoto && remove && (
              <Button variant="danger-outline" loading={removing} onClick={async () => {
                setRemoving(true); setRemoveError(null);
                const fd = new FormData();
                const r = await remove(fd);
                setRemoving(false);
                if (r) setRemoveError(r); else { setOpen(false); router.refresh(); }
              }}>Remove photo</Button>
            )}
          </div>
          {removeError && <p role="alert" className="text-[13.5px] text-bad">{removeError}</p>}
        </form>
      </Dialog>
    </>
  );
}
