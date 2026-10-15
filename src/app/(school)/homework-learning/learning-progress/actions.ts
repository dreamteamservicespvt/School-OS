"use server";

import { str } from "@/lib/fees/act";
import { HomeworkProblem } from "@/lib/homework/access";
import { issueCertificates } from "@/lib/homework/progress";
import { plural } from "@/lib/homework/words";
import { hwForm } from "../_lib/action";
import { UUID } from "../_lib/page";

/** Issue course certificates to every student who finished the learning path. */
export async function issueCertificatesAction(_prev: unknown, fd: FormData) {
  return hwForm("create", fd, async ({ tx, s }) => {
    const id = str(fd, "courseId");
    if (!UUID.test(id)) throw new HomeworkProblem("Choose the course.");
    return (await issueCertificates(tx, s, id)).length;
  }, (n) => `${plural(n, "certificate")} issued. Students see them in Study Material.`);
}
