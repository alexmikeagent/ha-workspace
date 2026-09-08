# HA Workspace development

## Product and workflow

- Treat the original wireframe as a workflow reference. Build a modern document workspace with clear hierarchy, progressive disclosure, restrained motion, keyboard support, and reduced-motion behavior.
- Read `docs/architecture/ARCHITECTURE.md`, `DESIGN.md`, and `EFFECT_GUIDE.md` before changing a feature boundary.
- Work in small feature branches after the initial foundation. Keep `main` usable, commit coherent changes, and open a focused PR with the problem, behavior, and verification. Never invent approvals, integration results, or completed features.
- Inspect the working tree before editing. Preserve unrelated user changes. Do not force-push or rewrite shared history.

## Architecture

- Use the Bun workspace and Vite+ toolchain pinned in `mise.toml` and `bun.lock`.
- Follow the feature-oriented hexagonal modular monolith: domain rules and schemas, application use cases and ports, then runtime adapters. Keep browser exports free of server dependencies.
- All authored use cases and side-effecting capabilities return Effect. Decode unknown data at boundaries, model expected errors, and compose explicit Layers at entry points. Keep pure functions and JSX straightforward.
- Use Effect Atom for shared UI state, derived views, and commands. One authenticated-session registry owns one Confect transport when live backend integration is added. Do not add a parallel query cache.
- Convex owns durable state and transactions; fibers own one running attempt. Persist idempotency, revision checks, leases, cancellation, and publication intent before relying on retries.
- Do not deploy functions into the existing local Convex service until its application/deployment isolation is verified. Infrastructure health checks are not permission to overwrite another application's functions or data.

## Files and secrets

- All application environment settings and secrets come from the `ha-workspace` Doppler project. Use `doppler run --no-fallback`; do not create `.env` files, committed credentials, secret exports, or application fallback caches. `doppler.yaml` contains only project/config selection.
- CLI sign-in credentials are bootstrap credentials managed by the tool's credential store, outside the repository. Never print their values or copy them into project files.
- Development reads use the configured `FAKE_DRIVE_ROOT`. Never point the adapter at the original Google Drive directory. Resolve paths and reject traversal, symlinks, and out-of-root access in the real adapter.
- Do not delete, move, or alter the original Drive folder. Do not delete data from the working fake drive without a specific request. Write new revisions to job-owned paths and publish under new filenames.
- Never commit client files, data manifests containing private filenames, rendered previews, source documents, runtime databases, or copied Drive content. The data root is a sibling of this repository.
- Treat Windows `.lnk` files as opaque shortcuts until their targets are explicitly mapped; never follow them automatically.
- Never register the fake drive with FreeFileSync or any live synchronization service. Exclude `sync.ffs_lock`, `sync.ffs_db`, and temporary `.ffs_tmp` paths from active use. Preserve any copied operational files as inert snapshot data; do not let the application open or act on them.

## HA document invariants

- The general report template is the read-only `Prototype 1.docx` with SHA-256 `C76ED63721FBD782ADD16B465B5D8C9FA784541EAD7EC368B9BD778C83A0F068`. Dulles uses the exact retained `dulles-sample.docx` exception.
- The general invoice reference is the read-only `HA_Consulting_Invoice_Style_Reference.docx`, SHA-256 `0C4274CAD6EAE18747CC41F80424D9A6E8B458F0F81A7DA258116F8451B77D7D`. Dulles/DGMTS uses its retained project/billing-series invoice style.
- Billing terms require same-client evidence. Template example content is not authority for another client or invoice.
- Respect Word owner locks; never close the user's Word session or remove a lock file. Validate a disposable candidate, preserve Markup Compatibility namespaces, and publish a new filename. Retain the source workspace's safe Windows renderer rules.
- Preserve task-owned report/invoice directories; no cleanup of another task's files.

## Verification

- Run Vite+ formatting, lint/type checks, and meaningful tests for the changed behavior. Exercise real document and runtime boundaries when they are introduced.
- Test duplicate requests, changed-payload idempotency conflicts, stale revisions, expired leases, cancellation cleanup, publication replay, and client/template separation.
- Keep UI empty, pending, disconnected, failed, and ready states truthful. Source compilation and isolated fixtures do not establish live Convex, auth, rendering, or agent integration.
