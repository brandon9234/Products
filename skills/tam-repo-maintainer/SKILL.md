---
name: tam-repo-maintainer
description: Maintain and extend the Products TAM Viewer repository. Use when working on the Next.js TAM snapshot viewer, TAM workbook import flow, dataset mutation routes, snapshot schema, tests, or agent-facing docs and skills in this repo. Trigger on requests about TAM data, workbook imports, sheet and image editing, snapshot JSON, repository documentation, or keeping agent artifacts in sync.
---

# TAM Repo Maintainer

## Overview

Work from the repository itself instead of reconstructing the architecture from scratch. Read `AGENTS.md`, `docs/agents/README.md`, and `docs/agents/repository-map.md` before making structural changes.

## Core Workflow

1. Identify whether the change touches the viewer UI, API routes, import pipeline, snapshot contract, tests, or agent artifacts.
2. Edit the smallest set of files that cleanly covers the change.
3. Run `npm run agent:refresh` after changing routes, scripts, tests, package scripts, agent docs, or skills.
4. Run targeted checks while iterating, then run `npm test` before finishing.
5. If the user is switching chats or says `chat handoff`, use `chat-handoff` instead of improvising a summary.

## Repo Anchors

- `app/tam/page.tsx` loads the committed workbook snapshot and resolves the selected sheet.
- `app/tam/tam-table.tsx` owns table sorting, pagination, inline edits, column creation, and row-image controls.
- `app/api/tam/datasets/[dataset]/sheet/route.ts` persists cell and column mutations.
- `app/api/tam/datasets/[dataset]/images/route.ts` persists manual image upload and delete operations.
- `src/lib/tam/importer.ts` converts workbook exports into snapshot JSON plus extracted workbook images.
- `src/lib/tam/loadSnapshot.ts` validates both the current workbook snapshot shape and the legacy single-sheet format.
- `scripts/import-tam.ts` is the CLI path for rebuilding `data/tam.snapshot.json`.

## References

- Read `references/workflows.md` for the repo-specific command map and change checklist.
