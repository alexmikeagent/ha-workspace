# HA Workspace implementation status

Updated September 8, 2026. The local workspace is connected: real files, company/project views, previews, downloads, file/source metadata, versioned comments, and bounded revision jobs. The remaining work is to broaden document workflows and verify remote access, rather than connect an empty shell.

## Locations and running boundaries

| Item                  | Current setup                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Code                  | `/home/akh/Projects/ha-workspace`                                                                                                  |
| GitHub                | Private [alexmikeagent/ha-workspace](https://github.com/alexmikeagent/ha-workspace); `gh` authenticated through the system keyring |
| Runtime tools         | Bun 1.4.2 and Node 24.20.0, pinned in `mise.toml`                                                                                  |
| Web app               | `127.0.0.1:4310`; production Bun serves the app and file API                                                                       |
| Development API       | `127.0.0.1:4312`, behind Vite's same-origin `/api` proxy                                                                           |
| HA Convex             | Isolated native `ha-workspace-local` instance: API `3220`, site `3221`                                                             |
| Backend data          | `/home/akh/Projects/ha-workspace-data/convex`                                                                                      |
| Existing Convex       | `/home/akh/LocalServices/Convex` on `3210`, preserved                                                                              |
| Fake Drive            | `/home/akh/Projects/ha-workspace-data/fake-drive`, the sole working copy                                                           |
| Original local mirror | `/home/akh/GoogleDrive`; never used as the app's provider                                                                          |
| Doppler               | `ha-workspace` / `dev_personal`, workplace `OmarchySys76`; CLI injection verified                                                  |

The app stays on loopback. The local owner session uses signed JWTs and same-origin file cookies. It does not establish remote or multiuser authentication. Browser tokens stay in memory; admin and signing credentials remain server-side.

## Available now

The catalog groups copied files by company and project, with source-based classifications and truthful unassigned states. Reports, Invoices, and Templates filter the same catalog. Search, sort, and bounded list pagination work with those files. The latest live import contains 7,225 active files, 13 companies, and 55 projects; later imports can change these counts.

A file opens its version chooser, preview, original download, and file/source metadata. PDF and images are shown directly; DOCX/PPTX use local PDF conversion; workbooks have bounded read-only grids; supported text has a readable preview. The Context inspector is metadata-only; extracted source text was removed from that panel. Backend extraction still supports document tooling and validation, without implying AI interpretation or contract approval. Missing, unsupported, locked, oversized, and failed previews keep their own states.

Comments are stored against a specific immutable version. Review and revision drafts persist in IndexedDB under the owner/file/version key, with saving and error feedback. A comment failure preserves the draft. Confect subscriptions update file versions, comments, and durable job status through the session's Effect Atom runtime.

For DOCX, TXT, and Markdown, a revision request can replace one exact match with explicit replacement text. Word edits stay within supported uninterrupted document-body text. They do not edit headers, fields, tracked changes, or paragraphs as a general Word editor. The worker writes a new candidate, validates it, renders Word candidates, and asks Convex to commit it. Base-version, cancellation, lease, and fencing checks keep stale attempts from advancing the visible version. Source files are never overwritten.

The sidebar fully collapses off canvas and remembers its state through a schema-backed Atom preference. Desktop width is independently saved: 248px by default, bounded to 220–360px and the available viewport. Its right-edge separator supports dragging and keyboard resizing while expanded. Collapsing retains the chosen width. Its top-left button remains available; Ctrl/Cmd+B toggles it outside text inputs. Mobile navigation uses a separate Sheet. Reduced-motion settings remove panel travel and transitions. The catalog and document inspector also share a persisted width preference: 330px by default, bounded to 280–560px and the available container. Desktop resizing supports pointer drag and keyboard controls; phone layouts stay full width. This behavior follows the [T3 Code layout](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/AppSidebarLayout.tsx) and [sidebar implementation](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/ui/sidebar.tsx), adapted to the workspace's own visual system.

## What copying proves

The original baseline copied 2,867 files in 989 directories, totaling 1,275,661,520 bytes. SHA-256 inventories matched at copy time, without modifying sources or sharing hardlinks. The user then added `HA inspection`. The latest checkpoint copied 7,185 inspection files, bringing the input total to 10,052 files and 4,062,865,634 bytes. Captured substantive files passed SHA-256 verification. A later source scan saw 28 arrivals beyond the checkpoint, so downloading was still active. Catch-up passes preserve newly arriving source files as live mirror repair continues. They do not delete destination content or register the working copy with a sync service.

Baseline evidence remains in `ha-workspace-data/manifests/verification.json` and `manifests/single-copy-verification.json`. New copy records live alongside those private manifests. `inspection-current-status.json` is the current checkpoint pointer; `inspection-existing-copy-preserved-latest.json` records preservation of the earlier working copy. File listings and document contents do not belong in this repository. An independent audit matched all 7,225 eligible paths to the catalog, with no omissions or extra fixtures. The remaining 2,827 copied inputs are intentionally excluded operational, hidden, tool, or unsupported material. Current app counts therefore differ from total copied inputs.

This is evidence about the selected local mirror. A complete, current cloud Drive inventory has not been established. Keep copied sync metadata inert, exclude `.ffs_lock`, `.ffs_db`, and `.ffs_tmp` paths from application operations, and treat `.lnk` shortcuts as opaque. Another task owns live synchronization. Application startup must neither reset the fake Drive nor modify the original mirror.

## Configuration and commands

Doppler owns application settings and secrets. Every runtime command uses `doppler run --no-fallback`; app `.env` files and secret exports are not part of the setup. `doppler.yaml` contains project/config selection only. Backend deployment synchronizes public JWT verification settings from Doppler; it does not copy the private signing key to Convex or the browser.

The root README lists the current key names. `bun run backend:start` starts the dedicated instance; `backend:deploy` guards the deployment target, generates Confect refs, and deploys. `drive:import` indexes the existing copy. `worker` runs the durable revision queue. `dev` owns Vite and the API process; `build` plus `start` uses the production Bun server. `worker:check` is a storage readiness check, not a job runner.

## Verification and remaining gates

The configured production build and Doppler injection have passed. Source checks and the expanding TypeScript suite cover domain, transport, authorization, storage, preview, and queue boundaries. The latest source suite passes 89 TypeScript tests and skips one optional runtime integration test. That optional test passed in the earlier Doppler-configured verification, alongside 21 Python document-helper tests. Live backend checks establish authenticated reads and commands on the isolated instance.

Earlier integrated-browser checks confirmed desktop sidebar collapse/persistence and Ctrl/Cmd+B, a real three-page DOCX PDF preview, the earlier source-text panel (subsequently removed), mobile layout at 390 × 844, drawer focus/navigation/close, a search returning real files, a bounded workbook grid with labeled cached values, and an unsent review draft surviving a full reload. No real client comment or revision was created by that browser check. These local viewport checks do not establish remote iPhone access.

The optional document-runtime test creates a synthetic DOCX, uses the actual worker logic with real Python and LibreOffice processes, and verifies the resulting PDF and corrected extracted text. Backend commit and replay run through isolated `convex-test` functions; the check preserves the source hash and existing comment anchors, avoids duplicate versions, and confirms staging cleanup. It creates no production records and changes no client documents. This establishes that bounded runtime path, while sustained reconnect and recovery behavior still need broader checks.

### September 8, 2026 — theme and inspector QA

Vite+ checked 108 formatted files and 66 source files without lint warnings or type errors. The source suite passed 85 tests and skipped the optional document-runtime test; the configured production build passed. Integrated-browser checks confirmed:

- Self-hosted Geist loaded, Hugeicons rendered, and the catalog used the dark scrollbar treatment. The Context inspector contained metadata without the removed document-text panel.
- At a 1224px desktop viewport, dragging across a PDF changed the inspector from 330px to 465px. The drag shield cleared on release. Arrow keys, Shift, Home, and End changed the width correctly.
- A 528px preference survived reload and navigation between the catalog and document workspace. At 900px, it clamped to 316px within the 676px container.
- At 390px, the inspector filled the viewport with no resize handle or horizontal overflow. The 280px Base UI drawer focused Companies; Escape restored focus to Open navigation, and choosing Companies closed the drawer.
- Sidebar collapse and Ctrl+B expansion worked. The browser reported no console warnings or errors. Width was restored to 330px and the viewport to 1224px after verification.

These checks used local viewports and do not establish remote iPhone access. No private filenames or screenshots are included in this record.

### September 8, 2026 — left navigation resize QA

Vite+ checked 111 formatted files and 69 source files without warnings or type errors. The suite passed 89 tests and skipped one optional runtime test; the production build passed. Browser checks verified:

- Dragging navigation from 248px to 328px, Home at 220px, End at 360px, and Shift+ArrowLeft at 328px. During an unfinished drag to 360px, the grid transition was disabled and the preview shield was present; Escape restored 328px and removed the shield.
- Collapse removed the handle. Reopening and reloading retained 328px. At 390px both resize handles were absent, with no horizontal overflow.
- The shared pointer logic still resized the inspector from 280px to 320px and back, independently of the 248px navigation width. No browser errors appeared. Catalog filters aligned on one row at a 1280px viewport.

Navigation was restored to 248px on desktop. The user's 280px inspector preference was preserved. These are local browser checks; remote iPhone access remains unverified.

Remaining gates include sustained reconnect/worker recovery, concurrent renderer stress, backup and restore, remote identity and Tailscale access, and real iPhone testing. Page/rectangle/cell annotations, automatic intake, template-based report and invoice generation, a skill/instruction editor, AI execution, and full Office authoring are not connected product features. Their architectural requirements remain in the plan without being presented as completed work.
