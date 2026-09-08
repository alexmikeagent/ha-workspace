# Architecture and visual plan

Open `ha-workspace-plan.html` for the visual plan. It includes the setup record, system map, Effect/Atom rules, document workflow, modern interface direction, motion study, and build gates.

- `SETUP.md`: confirmed locations, copy evidence, configuration ownership, and connected implementation status.
- `ARCHITECTURE.md`: chosen architecture, package/runtime boundaries, storage, and delivery sequence.
- `EFFECT_GUIDE.md`: v4 RC and Atom implementation rules, durable jobs, and local provider contract.
- `DESIGN.md`: current Vercel/Geist neutral dark authority, Base UI/shadcn and Hugeicons choices, T3 sidebar behavior, and visual acceptance.
- `dependency-evidence.json` and `design-evidence.json`: historical research evidence from the architecture work.
- `effect-example*`, `atom-*`, and `ATOM-VERIFICATION.md`: isolated API probes and their earlier verification records. They are examples, not application implementations or proof of live integration.

Regenerate the self-contained HTML with `python docs/architecture/build_plan.py` from the repository root. Edit the Markdown requirements and `plan.template.html`, then regenerate and run `mise exec -- bun run format`; the HTML is generated output. The generator requires only the Python standard library. The plan keeps its CSS and scripts inline and makes no external font requests; its Geist-first local stack uses system fallbacks if Geist is unavailable. The application self-hosts Geist font assets.

`verify_plan.cjs` is a retained manual browser QA helper using this machine's bundled Playwright and Chromium paths; it is not run by Codex UI automation. It checks responsive overflow, anchor IDs, controls, keyboard tabs, reduced motion, and print behavior. Its screenshots and QA output are local review artifacts. Codex uses the integrated browser for application QA. The current HTML static validation record is `static-verification.json`; it does not imply visual or runtime coverage.

These files were copied from the original planning directory and revised inside the new repository. `source-artifacts.json` records the source hashes; the original planning files were left unchanged during this documentation update. Private source documents and detailed file manifests are intentionally absent.
