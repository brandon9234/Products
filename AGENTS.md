# Agent Guide

## Read Order

1. `README.md`
2. `docs/agents/README.md`
3. `docs/agents/repository-map.md`
4. `skills/tam-repo-maintainer/SKILL.md` for normal repository work
5. `skills/chat-handoff/SKILL.md` when the user says `chat handoff`

## Repository Shape

- This is a local Next.js 15 app for importing, browsing, and editing TAM workbook data.
- The main UI lives in `app/tam/page.tsx` and `app/tam/tam-table.tsx`.
- Snapshot import and validation live under `src/lib/tam/` and `scripts/import-tam.ts`.
- Agent-facing artifacts live under `docs/agents/` and `skills/`.

## Commands

- `npm run dev`: start the local app
- `npm run import:tam -- --input "data/raw/tam.xlsx" --sheet TAM`: rebuild the snapshot
- `npm run agent:refresh`: regenerate the repository map
- `npm run agent:check`: fail if agent docs or skills are out of sync
- `npm test`: run the agent checks and the Vitest suite
- `npm run handoff`: refresh docs, run validation, and write `docs/agents/chat-handoff.md`

## Maintenance Rules

- Run `npm run agent:refresh` after changing routes, scripts, tests, package scripts, agent docs, or skill files.
- Treat `docs/agents/repository-map.md` as generated output.
- Use comments only for non-obvious behavior that would cost another agent time to rediscover.
- Do not discard existing user changes just to clean up the worktree.
- When the user says `chat handoff`, run `npm run handoff`, review the generated handoff note, and report validation status in the final reply.
