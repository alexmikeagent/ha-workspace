# HA Workspace

A private document workspace for HA Consulting. Browse company files, review previews, attach corrections to a specific revision, and produce a checked new version. The initial wireframe guides the workflow; the interface is being developed as a modern, accessible workspace with restrained motion and clear states.

This repository contains the initial application foundation and the architecture plan. Document editing/rendering, authenticated live Convex integration, and agent execution are subsequent vertical slices. The existing local Convex service has not been redeployed by this setup.

## Start locally

The repository pins Bun and a compatible Node tooling version in `mise.toml`.

```sh
mise install
mise exec -- bun install --frozen-lockfile
doppler login --scope .
doppler setup --no-interactive
mise exec -- bun run dev
```

`doppler.yaml` selects the `ha-workspace` project and `dev_personal` configuration. Runtime commands inject settings through Doppler with local fallback storage disabled. Do not create an `.env` file or export secrets into the repository. If Doppler requests account reauthentication, complete it before starting the application.

```sh
mise exec -- bun run check
mise exec -- bun run test
mise exec -- bun run build
mise exec -- bun run worker:check
mise exec -- bun run start
```

Static checks and fake-service tests need no application credentials. Build, worker, and server commands use Doppler. The worker check validates the configured local data boundary; it does not process or publish documents.

## Architecture

The product is a feature-oriented hexagonal modular monolith. Application use cases return Effect; adapters provide Convex, local storage, rendering, and agent capabilities. Effect Atom owns shared UI state and commands. A single Confect client will feed live data into atoms. Convex owns durable state and transactions; the Bun worker owns scoped execution of document jobs.

| Location               | Responsibility                                                       |
| ---------------------- | -------------------------------------------------------------------- |
| `apps/web`             | TanStack Start, React, shadcn, Tailwind, and Effect Atom interface   |
| `apps/worker`          | Bun/Effect entry point and local infrastructure readiness            |
| `packages/domain`      | Schemas, values, and pure feature rules                              |
| `packages/application` | Effect use cases and ports                                           |
| `packages/backend`     | Confect/Convex boundary reserved for the verified local deployment   |
| `packages/documents`   | Document/storage adapter boundary                                    |
| `packages/ui`          | Shared components and design tokens                                  |
| `docs/architecture`    | Decisions, visual plan, source evidence, and implementation guidance |

Open [the visual architecture plan](docs/architecture/ha-workspace-plan.html), or read [architecture](docs/architecture/ARCHITECTURE.md), [design](docs/architecture/DESIGN.md), and [Effect conventions](docs/architecture/EFFECT_GUIDE.md).

## Development data

The Drive data is outside this repository, in the sibling `ha-workspace-data` directory. It contains one standalone working fake drive, verified against the locally available Drive mirror: 2,867 files and 1,275,661,520 bytes, with identical SHA-256 inventories and no source changes or shared hardlinks.

The source is a selected local mirror. Its sync service was failed at copy time, so the snapshot is not proof of complete or current cloud Drive content. Windows shortcuts are preserved as opaque files. The redundant seed was removed after the user requested one copy; the working copy was reverified first. See the data directory’s README, `manifests/verification.json`, and `manifests/single-copy-verification.json` for local evidence.

Use the Doppler-configured working copy. Never change the original Drive folder, and never commit client files, private file listings, databases, previews, or generated documents. The copy is not registered with FreeFileSync or another sync service. Exclude FreeFileSync lock/database/temporary files from active use. Initial development has no Drive deletion or write-back operation.

## Configuration

Application configuration and secrets live in [Doppler](https://dashboard.doppler.com/workplace/0ef894f4f984eea889de/projects/ha-workspace). These are key names only; values remain in Doppler.

| Key                   | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `APP_ENV`             | Application environment                          |
| `VITE_APP_NAME`       | Public UI label; no secrets use a `VITE_` prefix |
| `FAKE_DRIVE_ROOT`     | Working development file copy                    |
| `WORKSPACE_DATA_ROOT` | Private data/verification root                   |
| `HOST`, `PORT`        | Local listener address                           |

The foundation remains loopback-only until authentication and private network access are implemented. Add future Convex/agent credentials directly to Doppler. CLI sign-in credentials are bootstrap credentials managed outside Git by the relevant tool's credential store.

## Development practice

After this initial foundation, use one focused branch per change and a small pull request. Keep `main` passing its source checks, preserve the lockfile, and record behavior and verification in each PR. The GitHub workflow runs formatting/lint/type checks and application tests without receiving client data or application secrets. Deployment is a separate operation.
