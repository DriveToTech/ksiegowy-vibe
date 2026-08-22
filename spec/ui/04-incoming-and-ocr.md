# Incoming Invoices And OCR Subtasks

> **Superseded.** The visual system described here (Aeon Ethereal) was replaced by **Aurora Solid** — see `spec/aurora-solid-redesign-plan.md` for the current source of truth on tokens, components, and screen layouts. This file is kept as historical record; do not build against it.

## Status
- Overall: `completed`

## Objective
Implement the incoming invoice flow using the Stitch upload/review direction while preserving current OCR and confirm/reject behaviors.

## Incoming List
1. Refactor `apps/web/src/app/dashboard/incoming/page.tsx`. Status: completed.
2. Replace raw table with shared ledger/list patterns. Status: completed.
3. Normalize incoming status badges. Status: completed.
4. Preserve total count and review links. Status: completed.

## Upload Workspace
1. Refactor `apps/web/src/app/dashboard/incoming/UploadButton.tsx`. Status: completed.
2. Replace the button-only interaction with a modern upload workspace. Status: completed.
3. Add drag-and-drop support. Status: completed.
4. Keep file picker fallback. Status: completed.
5. Surface upload loading and error states clearly. Status: completed.
6. Preserve redirect to the created incoming invoice review route after upload. Status: completed.

## OCR Review
1. Refactor `apps/web/src/app/dashboard/incoming/[id]/ReviewPanel.tsx`. Status: completed.
2. Replace fixed two-column layout with responsive workspace behavior. Status: completed.
3. Preserve `EventSource` OCR status updates. Status: completed.
4. Keep document preview panel and OCR data panel. Status: completed.
5. Normalize editable fields with shared form components. Status: completed.
6. Restyle confirm/reject actions. Status: completed.
7. Ensure mobile layout stacks content cleanly. Status: completed.

## Review Route Container
1. Refactor `apps/web/src/app/dashboard/incoming/[id]/page.tsx` to use the new template primitives. Status: completed.
2. Keep current fetch/error behavior but present it through shared empty/error states. Status: completed.

## Deliverables
- incoming list rebuilt
- upload workspace rebuilt
- OCR review workspace rebuilt

## Risks To Watch
- `EventSource` lifecycle during layout refactor
- iframe/document preview sizing on smaller screens
