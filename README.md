# HA Workspace

A private document workspace for HA Consulting. Browse company and project files, open a preview, keep comments with the version you reviewed, and make a precise correction as a new version.

The local catalog, authenticated Confect subscriptions, previews, downloads, file/source metadata, and versioned comments are connected. A Bun worker processes bounded exact-text revision requests for DOCX, TXT, and Markdown. The interface uses Effect Atom throughout, including saved review drafts, a fully collapsible sidebar, and a resizable inspector. Agent execution, report generation, the skills editor, and remote iPhone access are later steps.

The interface follows a Vercel/Geist neutral dark direction, with self-hosted Geist Sans/Mono, shadcn `base-nova` components built on Base UI, and Hugeicons. The T3-inspired sidebar retains its saved Atom preference, keyboard shortcut, independent mobile drawer, and reduced-motion behavior. The header uses a compact HA mark with a single-line HA Workspace name, and scrolling surfaces share the neutral theme. See the [interface contract](docs/architecture/DESIGN.md) for the adopted tokens and source references.

## Run locally

Install the pinned tools and dependencies, then select this project's Doppler configuration:

```sh
mise install
mise exec -- bun install --frozen-lockfile
doppler setup --no-interactive
```

Doppler CLI authentication is working. On a fresh machine or after a credential expires, run `doppler login --scope .`. `doppler.yaml` selects `ha-workspace` / `dev_personal`. Runtime commands use `doppler run --no-fallback`; no app `.env` file or secret export is needed.

Start the dedicated backend in one terminal. Deploy after backend changes, import after adding files to the working copy, and run the revision worker in another terminal:

```sh
mise exec -- bun run backend:start
```

```sh
mise exec -- bun run backend:deploy
mise exec -- bun run drive:import
mise exec -- bun run worker
```

Start the app in a third terminal:

```sh
mise exec -- bun run dev
```

Development starts Vite on `http://127.0.0.1:4310` and a Bun API listener on `4312`; the browser uses the same-origin `/api` proxy. The runner owns both processes and closes them together. The backend and revision worker have their own lifetimes. Do not launch a second backend on an occupied port.

For the production build, stop the development web process first, then run:

```sh
mise exec -- bun run build
mise exec -- bun run start
```

The production Bun server serves the app and file API together on `4310`. A running backend is required for catalog and comment operations; a running revision worker is required for queued document changes.

## Checks

```sh
mise exec -- bun run check
mise exec -- bun run test
mise exec -- bun run worker:check
mise exec -- bun run backend:verify
```

Source checks and unit tests need no application credentials. `worker:check` validates the configured storage roots. `backend:verify` exercises the dedicated local backend through Confect; it is an integration check and requires the local service and Doppler configuration. Browser and real-document checks are recorded separately from source compilation. The latest source suite passes 85 TypeScript tests and skips one optional document-runtime test. That optional test passed separately in the earlier Doppler-configured runtime check. The Python document-helper suite has 21 passing tests.

```sh
doppler run --no-fallback -- mise exec -- bun run test
```

The optional integration test creates a synthetic DOCX in temporary storage, runs the actual revision worker logic and Python/LibreOffice tools, and verifies the new PDF and extracted correction. It exercises backend commit/replay through isolated `convex-test` functions, preserves the original hash and comment anchors, and checks staging cleanup. It does not create production records or revise client documents.

## Architecture

The project is a feature-oriented hexagonal modular monolith. Effect use cases and typed ports keep document rules separate from Convex, the filesystem, and rendering tools. Convex owns durable state and transactions. One authenticated Confect WebSocket feeds live queries into the session's Atom registry; there is no second query cache. The Bun worker owns each running document attempt.

| Location               | Responsibility                                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| `apps/web`             | TanStack Start interface, Atom state, local session and protected file API |
| `apps/worker`          | Import, revision processing, and development process orchestration         |
| `packages/domain`      | Schemas, values, and feature rules                                         |
| `packages/application` | Effect use cases and capability contracts                                  |
| `packages/backend`     | Confect specs, authenticated Convex functions, deployment and local auth   |
| `packages/documents`   | Working-copy provider, extraction, preview conversion, revision tools      |
| `packages/ui`          | Base UI/shadcn components, Hugeicons, shared tokens, responsive layout     |
| `docs/architecture`    | Decisions, visual plan, source evidence, and remaining gates               |

Read the [visual plan](docs/architecture/ha-workspace-plan.html), [architecture](docs/architecture/ARCHITECTURE.md), [interface contract](docs/architecture/DESIGN.md), and [Effect conventions](docs/architecture/EFFECT_GUIDE.md).

## Working with files

The sole fake Drive is `/home/akh/Projects/ha-workspace-data/fake-drive`, outside Git and live synchronization. It now includes the added `HA inspection` collection alongside the original consulting workspace. Copying preserves source files and folder relationships. Private manifests record SHA-256 verification and catch-up copies as the source mirror changes. This establishes the available local snapshot; complete cloud Drive coverage has not been verified.

The latest September 8 checkpoint contains 10,052 copied input files (4,062,865,634 bytes), including 7,185 inspection files. Reimport indexed 7,225 active files, 13 companies, and 55 projects. A later source scan saw 28 arrivals after that checkpoint; live mirror downloading was still active. These are snapshot counts, not a fixed collection size or a complete cloud inventory. The app displays the current indexed counts. Company and project groupings come from copied folders; ambiguous context is left unassigned or labeled as inferred. Category and search filters do not reorganize source files.

Previews support PDF and photos, converted DOCX/PPTX, bounded workbook grids, and readable text. Unsupported files remain downloadable. Comments belong to an immutable version. A revision request replaces one exact match; DOCX changes are limited to uninterrupted body text and exclude fields, tracked changes, headers, and cross-paragraph edits. The worker checks the base version, stages new bytes, validates and renders Word candidates, and commits only an eligible attempt. It never edits an imported source in place. Full Office editing and template-based document generation are not implemented.

Keep client documents, filenames in private manifests, databases, previews, and revision outputs outside Git. Never point the provider at the original Drive directory. Sync locks/databases/temporary files and opaque Windows shortcuts are excluded from active operations. The app does not delete from or write back to the original Drive.

## Local services and configuration

HA Workspace uses an isolated native Convex instance named `ha-workspace-local`, with client API `3220`, site port `3221`, and persistent files under the sibling `ha-workspace-data/convex` directory. The existing service under `/home/akh/LocalServices/Convex` on `3210` was preserved. Deployment scripts check the target before changing functions or data.

All application settings and secrets belong to [Doppler](https://dashboard.doppler.com/workplace/0ef894f4f984eea889de/projects/ha-workspace). Key names only:

| Keys                                                                | Purpose                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| `APP_ENV`, `VITE_APP_NAME`                                          | Environment and public UI label                      |
| `HOST`, `PORT`, `API_PORT`                                          | Loopback web and development API listeners           |
| `FAKE_DRIVE_ROOT`, `WORKSPACE_DATA_ROOT`, `DRIVE_COMPANY_ROOTS`     | Working-copy boundary and folder classification      |
| `CONVEX_SELF_HOSTED_URL`, `CONVEX_SITE_URL`, `CONVEX_INSTANCE_NAME` | Dedicated backend target                             |
| `CONVEX_SELF_HOSTED_ADMIN_KEY`, `CONVEX_INSTANCE_SECRET`            | Backend administration; never sent to the browser    |
| `AUTH_PRIVATE_JWK`, `AUTH_JWKS`, `AUTH_ISSUER`, `AUTH_AUDIENCE`     | Local signing and backend verification               |
| `PYTHON_BIN`, `LIBREOFFICE_BIN`                                     | Local extraction, verification, and conversion tools |

The local owner session uses a signed JWT, an HttpOnly same-origin cookie for files, and an in-memory browser token for Convex. It is a loopback prototype, not a multiuser login system. Tailscale exposure, remote authentication, backup/restore, and iPhone access need their own checks before enabling remote use. CLI bootstrap credentials stay in the tools' credential stores outside Git.

## Development practice

Use a focused branch and a small pull request for each change. Keep source checks passing, preserve the pinned lockfile, and record the behavior, checks, and limitations in the PR. GitHub CI receives no client data or application secrets. Deployment remains a separate, guarded operation.
