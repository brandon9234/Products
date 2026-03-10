# TAM Repo Workflows

## Standard Entry Points

- Start with `AGENTS.md`.
- Use `docs/agents/repository-map.md` when you need the current file inventory.
- Use `npm run import:tam -- --input "data/raw/tam.xlsx" --sheet TAM` when the workbook export changed.

## Change Checklist

1. Update the relevant TAM code.
2. Refresh the repository map with `npm run agent:refresh` if you changed routes, scripts, tests, skills, package scripts, or agent docs.
3. Run `npm test`.
4. If the user is handing off to another chat, run `npm run handoff`.

## High-Signal Files

- `app/tam/page.tsx`
- `app/tam/tam-table.tsx`
- `app/api/tam/datasets/[dataset]/sheet/route.ts`
- `app/api/tam/datasets/[dataset]/images/route.ts`
- `src/lib/tam/importer.ts`
- `src/lib/tam/loadSnapshot.ts`
- `src/lib/tam/datasetStore.ts`
