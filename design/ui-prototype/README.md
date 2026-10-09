# School OS UI design (round 1)

Clickable prototype of the main screens, for approval before functionality is built.

- `school-os-ui.html` is the published page (one file).
- `src/` is the React + Tailwind source. `build.sh` rebuilds it (needs esbuild, tailwindcss 3.4, @tailwindcss/container-queries, lucide-react).
- Screens: Sign in, main menu, Dashboard, Student list, Student profile, Collect fee (with receipt), Take attendance and Register, Parent Link, Colours and dark mode, Approvals.
- Design tokens are CSS variables in `src/styles.css`: six school colours, light and dark, standard and large text.
- Responsive rules use container queries on the app frame, so the "Phone" preview on a computer is the real phone layout.
- All names and numbers are example data for Sunrise Public School.
