"use client";

import { useState } from "react";
import { Archive, IdCard, Pencil, Printer } from "lucide-react";
import { MenuItem, MenuLink, MoreMenu } from "@/components/ui/kit-client";
import { ArchiveSheet } from "../datesheet-ui";

/** The datesheet's "..." menu: print, edit, admit cards and archive. */
export function DetailMenu({ examId, title, printHref, editHref, admitHref, locked, canArchive }: { examId: string; title: string; printHref: string; editHref: string | null; admitHref: string | null; locked: boolean; canArchive: boolean }) {
  const [archive, setArchive] = useState(false);
  return (
    <>
      <MoreMenu label={`More actions for ${title}`}>
        <MenuLink href={printHref} external icon={<Printer size={17} />}>Print datesheet</MenuLink>
        {editHref && <MenuLink href={editHref} icon={<Pencil size={17} />}>{locked ? "Change title" : "Edit datesheet"}</MenuLink>}
        {admitHref && <MenuLink href={admitHref} icon={<IdCard size={17} />}>Admit cards</MenuLink>}
        {canArchive && <MenuItem onSelect={() => setArchive(true)} icon={<Archive size={17} />} tone="bad">Archive</MenuItem>}
      </MoreMenu>
      <ArchiveSheet examId={examId} title={title} open={archive} onClose={() => setArchive(false)} doneHref="/examination-results/datesheet" />
    </>
  );
}
