# School OS test copy

A working copy of School OS that anyone can sign in to, loaded with the demo
school (Sunrise Public School). Everything runs in one container: the web app,
the background worker, its own PostgreSQL 16 database and Chromium for PDFs.
It needs about 1 GB of memory once running.

**It is for trying the software only.** The database lives inside the
container, so each restart starts again from a fresh demo school. Never put a
real school's data in it; see [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md)
for the real setup.

## Put it online for free (Hugging Face Space)

1. Make a free account at <https://huggingface.co/join>.
2. Open <https://huggingface.co/new-space>. Name it `school-os`, choose
   **Docker** and the **Blank** template, keep **CPU basic (free)**, choose
   **Public**, and press **Create Space**.
3. In the new Space open **Settings → Variables and secrets → New secret**.
   Name `DEMO_PASSWORD`, value: the password everyone will sign in with.
   (Skip this and the password is `SchoolOS@2026`.)
4. Open **Files → Add file → Create a new file**, name it `Dockerfile`, paste
   in [the Dockerfile in this folder](Dockerfile), and press **Commit**.
5. The Space builds (about 15 minutes) and then loads the demo school (about
   5 minutes). The app opens at `https://<your-username>-school-os.hf.space`.

Open that `.hf.space` address directly; the app refuses to run inside the
Hugging Face page frame for safety. A free Space sleeps after two days with
no visitors and starts fresh on the next visit.

## Run it on any computer with Docker

```bash
docker build -t school-os-test deploy/test-copy
docker run -p 7860:7860 -e DEMO_PASSWORD=choose-one school-os-test
# open http://localhost:7860
```

## Signing in

Usernames: `principal`, `admin`, `accountant`, `teacher`, `subjectteacher`,
`librarian`, `reception`, `transport`, `driver`, `warden`, `boyswarden`,
`store` and `viceprincipal`, all with `DEMO_PASSWORD`. The Super Admin
console is at `/console/sign-in` with the mobile number `9849012345` and the
same password; its one-time code is written to the Space's logs.
