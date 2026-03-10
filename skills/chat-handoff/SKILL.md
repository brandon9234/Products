---
name: chat-handoff
description: Prepare this repository for a context-window or chat transition. Use when the user says chat handoff, context handoff, switching chats, handoff to another agent, or asks to leave the repo ready for the next chat. Refresh agent docs, run validation, capture worktree state, and update the handoff note.
---

# Chat Handoff

## Overview

Use the repository handoff workflow instead of writing a freeform summary from memory. Leave the next chat with an updated handoff file and current validation status.

## Workflow

1. Run `npm run handoff`.
2. Open `docs/agents/chat-handoff.md` and confirm it reflects the current worktree and validation status.
3. If the task introduced unresolved questions or manual follow-up, add a short note near the top of the file before finishing.
4. In the final response, report whether `npm run handoff` passed and point the next chat to `AGENTS.md`, `docs/agents/README.md`, and `docs/agents/chat-handoff.md`.
5. Never revert unrelated user changes just to make the handoff look clean.

## References

- Read `references/checklist.md` if the handoff needs manual notes beyond the generated file.
