Demo data. `core.ts` makes the school (years, classes, staff, students);
each module adds `<module>.ts` exporting a `ModuleSeed` and one line in
`index.ts`. Seeds run once on an empty database (`npm run db:reset`).
