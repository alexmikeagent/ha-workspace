# HA Workspace foundation status

Updated September 8, 2026. This is a setup record and implementation plan. Application workflow features and the complete live runtime are still being built.

## Confirmed locations and services

| Item                  | Current decision and status                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code                  | `/home/akh/Projects/ha-workspace`                                                                                                                 |
| GitHub                | Private [alexmikeagent/ha-workspace](https://github.com/alexmikeagent/ha-workspace) repository; GitHub CLI authenticated using the system keyring |
| Runtime tools         | Bun 1.4.2 and Node 24.20.0 installed and pinned in `mise.toml`                                                                                    |
| Web foundation        | Modern shadcn/TanStack Start shell with Effect Atom; Vite+ source checks and 25 tests pass; configured build awaits Doppler reauthentication      |
| Fake Drive            | `/home/akh/Projects/ha-workspace-data/fake-drive`, populated and SHA-256 verified                                                                 |
| Original local mirror | `/home/akh/GoogleDrive`, preserved unchanged during copying                                                                                       |
| Convex service        | `/home/akh/LocalServices/Convex`; no changes made to the existing service or its data                                                             |
| Doppler               | New `ha-workspace` project in workplace `OmarchySys76`; local config `dev_personal`                                                               |
| Doppler CLI           | Reauthentication pending; runtime injection still needs confirmation                                                                              |

## What the data check proves

The copy contains 2,867 files in 989 directories, totaling 1,275,661,520 bytes. The working copy content hashes match the original source at copy time. Verification found no omitted or unstable files, no symlinks, and no hardlinks shared with the source. Copying did not use a delete option. The source stayed unchanged during the copy. Verification finished at `2026-09-08T05:34:31Z`. These are baseline snapshot facts; later live sync repair work can change the original mirror.

This is a complete copy of the selected local mirror. It has not been compared with a current inventory of the entire cloud Google Drive. Failed-sync artifacts, 11 Windows `.lnk` files, and 30 zero-byte files are preserved. Importing them does not imply that the application can preview them or resolve their cloud targets.

The local summaries are `/home/akh/Projects/ha-workspace-data/manifests/verification.json` and `manifests/single-copy-verification.json`. Content listings and source documents stay in the private data directory and are not committed to Git. The user requested one standalone working copy. Application startup must not reset it or modify the original mirror. New writes use a managed area inside the working provider and must not replace existing files. Keep the standalone copy outside Drive and do not register it with FreeFileSync. Preserve copied `sync.ffs_lock`, `sync.ffs_db`, and `*.ffs_tmp` files, but exclude them from indexing and active use. This project does not change live sync configuration; a separate task owns that work.

## Configuration ownership

Doppler is the source of application environment values and secrets. Use `doppler run --no-fallback` to inject the selected project/config at runtime. Do not create app `.env` files, export secret files into the repository, or rely on stale fallback caches.

The local configuration contract includes `APP_ENV`, `VITE_APP_NAME`, `FAKE_DRIVE_ROOT`, `WORKSPACE_DATA_ROOT`, `HOST`, and `PORT`. The local web binding is `127.0.0.1:4310`. Server/worker configuration is decoded with Effect Config; only intentionally public values are passed to browser code. Future backend, worker-identity, and agent credentials belong to the same Doppler project with appropriate separate environment configurations.

Browser login and project creation do not establish a working CLI credential. Complete Doppler CLI reauthentication, verify the selected project/config, and run a value-redacted injection check before relying on the launch command. Do not print secret values in validation output.

## Remaining foundation gates

1. Verify the final configured production build after Doppler reauthentication. Vite+ migration, frozen-lockfile installation, source checks, and 25 tests have passed.
2. Confirm Doppler CLI injection and startup configuration without local environment files.
3. Inspect the existing local Convex service and choose the application deployment without overwriting unrelated data.
4. Prove one authenticated live read and typed command through Confect, Effect, and Atom in two isolated browser sessions.
5. Run the Start production output on Bun and prove worker file streaming, child-process cancellation, and cleanup.
6. Connect the modern shell to the fake Drive provider, then complete one persistent file → preview → comment → revised preview path.

## Interface direction

The wireframe is the workflow guide. The final application uses its own semantic tokens, readable hierarchy, consistent controls, and progressive disclosure. Motion is brief and useful: subtle feedback, short panel transitions, and stable document position. Reduced-motion preferences, keyboard access, and iPhone touch behavior are part of the acceptance contract in `DESIGN.md`.
