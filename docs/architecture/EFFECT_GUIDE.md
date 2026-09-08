# Effect architecture and coding guide

Adopted for HA Workspace on September 8, 2026. These are implementation requirements. The repository, local data foundation, and shadcn/Start scaffold exist; the baseline Start build passed. Vite+ source checks and 25 application/adapter tests pass. The final configured build awaits Doppler reauthentication; the linked code examples remain separate API checks. Feature completion and live integration are measured by the repository acceptance gates.

## Architecture decision: hexagonal modular monolith

Keep one product repository and release line, with local Convex as the metadata store. Run the web server and document worker as separately supervised processes. Their deployment needs differ, but their domain rules belong to the same application.

Organize code by feature. Use Effect services as ports: small interfaces describing the capabilities a use case needs. Adapters connect those capabilities to Convex, Bun, the local fake Drive, document tools, and Codex. This lets us test template selection and revision rules without starting a browser or office renderer. The original ports-and-adapters architecture describes this separation between application behavior and its external drivers. [Cockburn’s original article](https://alistair.cockburn.us/hexagonal-architecture).

The application of that architecture to this project is:

| Module       | Owns                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| Catalog      | Companies, projects, files, immutable versions, preview manifests                                     |
| Review       | Version-specific annotations, comments and revision requests                                          |
| HA policies  | Template selection, intake requirements, report/invoice rules, client evidence and publication checks |
| Instructions | AGENTS.md and skill versions, drafts, apply operations and source conflicts                           |
| Jobs         | Durable work requests, attempts, leases, cancellation, progress and completion                        |

Mirror these feature names inside `domain` and `application`. Keep each feature’s schemas, use cases and tests close together. Reporting and invoicing can remain workflows under HA policies until their size warrants separate modules. Start with the existing workspace packages; do not create a package for every service.

### Dependency rules

Code dependencies point inward: adapters import application ports/use cases; application imports domain; domain imports Effect and other domain code. Only composition roots choose live Layers.

1. Domain code cannot import React, Confect implementations, Bun globals, filesystem APIs, or the agent SDK.
2. Application use cases depend on focused services such as `TemplateCatalog`, `RevisionStore`, `DocumentRenderer`, `InstructionSource`, and `AgentRuntime`.
3. An adapter implements a service. Tests can substitute an in-memory implementation or a controlled failure.
4. Cross-feature changes go through the owning module’s public operations. A second module cannot update another module’s tables directly.
5. Separate browser-safe contracts, Convex implementations, and Bun adapters in package exports. Do not re-export them all from a shared barrel.
6. Restrict direct infrastructure imports and `Effect.run*`/runtime creation to named boundary files. CI checks these import rules.

Start with explicit modules and a durable job table. Additional services, an event bus, event sourcing, and a generic workflow language would add coordination work before the document loop needs them.

## What fully Effectified means

All authored application use cases and side-effecting service methods return `Effect.Effect<Success, ExpectedError, Requirements>`. External data is decoded at entry; effects carry expected failures and dependencies in their types. That applies to the browser’s commands, Confect functions, the Bun worker, file processing, and agent streams.

Pure calculations and JSX stay ordinary TypeScript/React. A total calculation needs no runtime wrapper. Framework hooks and third-party Promise APIs are adapters; they do not become a second place for business logic.

| Boundary                   | Rule                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Browser state and commands | Effect Atom in one authenticated-session registry; `Atom.runtime` and runtime function atoms execute feature use cases |
| Browser subscriptions      | One scoped Confect WebSocket client; live streams feed read atoms through a typed adapter                              |
| Start server handlers      | Decode, authenticate, run a use case, map its result to the framework response                                         |
| Convex functions           | Confect v10 Effect implementations with deterministic, invocation-scoped services                                      |
| Bun worker                 | `@effect/platform-bun` at the entry point; scoped Effect jobs and platform adapters                                    |
| External libraries         | Wrap their Promise/callback APIs once; map exceptions into the port’s declared errors                                  |
| Document/agent processes   | Acquire, stream output, cancel, and release through scoped services                                                    |

Use a session-owned Atom registry and runtime. Dispose session resources on logout or owner change; SSR authentication and registries belong to their request. Do not place mutable user identity or request-bound Convex context in a process-wide singleton. RC.112 scopes `Atom.runtime` layer memoization to its registry; avoid a global memo map for user services. [Pinned Atom implementation](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/reactivity/Atom.ts).

## Effect Atom owns application state in the UI

Adopt `@effect/atom-react@4.0.0-rc.112` with `Atom`, `AtomRegistry`, and `AsyncResult` from `effect/unstable/reactivity`. The React package supplies `RegistryProvider` and hooks such as `useAtomValue` and `useAtomSet`. It requires React 19 and a compatible scheduler. The older `@effect-atom/atom-react` package and its v3 examples are not this version. [React package metadata](https://registry.npmjs.org/@effect/atom-react/4.0.0-rc.112), [pinned React bindings](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/atom/react/README.md).

This is the state ownership model:

| State                                                   | Owner and lifetime                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Inspector tab, selected annotation, zoom, panel widths  | Feature atoms in the authenticated workspace registry                                            |
| Composer and instruction drafts                         | Atoms keyed by owner, document/revision, and draft kind; persist through an injected draft store |
| Pending command, typed error, local progress            | Runtime function atoms and `AsyncResult`; command success contains the durable job ID            |
| Live files, comments, job progress, active instructions | Read atoms projecting the single Confect subscription stream; Convex remains authoritative       |
| Derived view state                                      | Derived atoms combining local state and live reads; avoid copying lists into writable atoms      |
| Shareable company/file/filter selection                 | TanStack Router URL state, read by the feature boundary; no independently writable duplicate     |
| Focus, element measurements and animation details       | React refs and component lifecycle where local DOM ownership is clearer                          |

Create one stable `Atom.runtime` from the browser's live Layer inside its session boundary. Use its `fn` constructor for commands and its stream-backed atoms for reads and progress. This replaces the separate browser `ManagedRuntime` bridge. Keep command/use-case definitions in the application package and atom definitions in each web feature, so application code does not import UI reactivity APIs. Standalone server and worker boundaries retain their own scoped execution model.

Choose one scoped `@confect/js` WebSocket client as the browser transport. Its typed commands and `reactiveQueryResult` streams become application-service adapters. The Atom registry owns the reactive presentation graph. Do not mount parallel Confect React query hooks, a second Convex client, or a second query cache for the same data. Preserve Confect codecs and explicit typed query errors in the bridge. This integration is an architecture choice to verify in the foundation build. [Confect JavaScript client](https://confect.dev/v10/clients/js/websocket.md).

Use stable feature atom definitions or factories keyed by normalized subscription identity: function, arguments, and authenticated session. An equivalent query should share one read atom. Dispose subscriptions and old-session state on logout; reconnect must restore the existing subscription without duplicating listeners. `Atom.keepAlive` is a deliberate lifetime choice, never the default solution for every atom.

Use an explicit `RegistryProvider` keyed by a session epoch. Updating its initial-value options does not create a new registry. Mount the runtime at the authenticated shell so moving between file panes does not churn its client. The built-in provider delays disposal briefly to accommodate StrictMode remounts; logout must also perform the owned authentication teardown and clear old-session state. On SSR, allocate and dispose a registry per request; browser WebSocket and storage Layers are client-only. [Pinned registry provider](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/atom/react/src/RegistryContext.ts).

`WebSocketClient.layer(url)` supplies the scoped client. Register the chosen authentication token callback through `setAuth` before mounting protected reads. Registration alone does not mean authentication has completed; expose auth readiness separately and wait for its confirmation. The sign-in provider remains an implementation choice, but identity cannot be hidden in module-global state.

Use `reactiveQueryResult` for live views. It emits query successes and declared/transport/schema failures as `Result` values; the adapter projects them to `AsyncResult` while retaining the previous successful value. An error event on an established query must not end the stream. Invalid arguments can fail encoding before a subscription exists; that initial failure needs corrected input. The simpler `reactiveQuery` promotes errors into stream failure, so it is not the default for a view that should recover from a later update. Treat reconnect status separately from data success. [WebSocket client behavior](https://confect.dev/v10/clients/js/websocket.md).

Persist important drafts through explicit Effect load/save operations backed by IndexedDB, with visible saving and error states. Use Effect Schema and a versioned record; key it by owner and immutable source revision. Keep credentials and tokens out of persisted atoms. A changed base revision preserves the old draft and shows a conflict instead of silently applying it to a new file. Use schema-backed `Atom.kvs` for small panel/theme preferences. Its optimistic UI value does not prove a write persisted, so important drafts keep their explicit save acknowledgement. `Atom.keepAlive` only retains memory. Start with an SSR shell and client-loaded authenticated atoms; add explicit, request-isolated hydration only when needed.

Command state ends when a mutation acknowledges its job ID. Durable rendering/agent progress comes from job subscriptions, so closing a component or cancelling an atom does not imply a server job was cancelled. A cancel command changes durable job state; the worker observes it. Runtime function atoms normally replace and interrupt their previous local invocation. Use a separate atom per independent operation and disable duplicate submission while its command is pending. Await `promiseExit` only when a framework callback needs an awaited result; ordinary views read the command atom. Enforce idempotency in Convex as well. [Pinned Atom commands](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/reactivity/Atom.ts).

## Write readable v4 RC code

The checked baseline is `effect@4.0.0-rc.112`, matching Effect platform/test packages and `@confect/*@10.0.0-next.21`. Use source and type declarations for that pin when examples disagree. Current documentation can contain migration leftovers.

### Services and composition

Use v4 `Context.Service` for ports and `Layer.succeed` or `Layer.effect` for implementations. Construct a Layer explicitly; v3 `Effect.Service` conveniences and automatic `.Default` layers are not the project pattern. Give service identifiers a project/feature prefix and define operation-sized methods. [v4 service migration](https://github.com/Effect-TS/effect/blob/main/migration/services.md).

Use a named `Effect.fn` for an application operation, and `Effect.gen` when a sequence reads naturally as steps. Let private helpers infer their types; public ports and module boundaries should expose their success/error/requirement contract. Prefer a short generator over a long pipeline of nested callbacks. Use services for replaceable capabilities, not for every pure helper.

Web, worker, and Convex boundaries each have their own composition root. They provide live services once at the correct lifetime. A function in the middle of a workflow must not construct a new client, call `runPromise`, or start a hidden runtime.

At the worker entry point, provide `BunServices.layer` and start with `BunRuntime.runMain` from the pinned `@effect/platform-bun`. The layer supplies filesystem, path, crypto, child-process, stdio, and terminal capabilities. Keep unstable process APIs inside the document adapter so an RC upgrade has a small surface to inspect. [Pinned Bun services](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/platform-bun/src/BunServices.ts).

### Schemas and errors

Use Effect Schema for domain values, commands, stored representations, external process results, and expected errors. Decode `unknown` at trust boundaries with the pinned version’s schema API; branded IDs or refinements should represent real invariants. Keep ordinary serializable encodings at the Convex boundary and follow Confect’s schema restrictions. [Confect schema restrictions](https://confect.dev/v10/concepts/schema-restrictions).

Model recoverable failures with specific tagged types: `TemplateMismatch`, `MissingFacts`, `RevisionConflict`, `WordFileLocked`, `RenderFailed`, and `LeaseLost`. Handle them deliberately with tag-based recovery or map them to useful UI/API states. Preserve underlying causes for diagnosis, while excluding document content, secrets, and raw credentials from logs.

At RC.112 the checked APIs include `Schema.TaggedError`, `Schema.decodeUnknownEffect`, and `Result`. Do not copy `TaggedErrorClass`, `Schema.decodeUnknown`, or v3 `Either` examples without checking the exact package. Confect functions with declared error schemas return a typed result through their client adapters. [Pinned Schema source](https://unpkg.com/effect@4.0.0-rc.112/src/Schema.ts), [Confect errors](https://confect.dev/v10/server/error-handling).

Keep expected failures in the error channel. Avoid `orDie`, blanket `catchAll`, `any`, non-null assertions, and casts used to silence missing services or schema mismatches. Defects mean a broken assumption or bug and should retain their diagnostics. Boundary code can translate them into a safe response without turning them into a fake success.

### A small, checked example

`effect-example.mts` demonstrates a decoded command, a typed capability, a named operation, and a recoverable revision conflict. Its fake Layer and assertions passed strict TypeScript checking and executed under the existing Node 26.7.0 runtime against Effect RC.112. The visible HTML shows the use-case portion. `effect-example-verification.md` records the checks.

This establishes the API shape only. The example does not test authorization, idempotency, Convex transactions, Bun, or the complete application. A live `RevisionRequests.enqueue` adapter must authorize the caller, compare the revision, deduplicate the request, and enqueue the job atomically.

### Confect v10 contracts

Keep client-safe API specs separate from implementations. In v10, `args` is a lazy field-map callback; `returns` and `error` are schema callbacks. Complete the API group with `GroupImpl.finalize`. Wire encodings must be valid Convex values, and boundary codecs cannot require injected services. Use `Schema.Null` for no-value returns. Avoid copying a schema example from a different prerelease. [Spec/implementation model](https://confect.dev/v10/concepts/spec-impl-model.md), [schema restrictions](https://confect.dev/v10/concepts/schema-restrictions.md).

In queries, Confect stubs `Date.now()` and Effect's internal clock reads to constants so logging, spans, and fiber creation preserve cacheability. Explicit `Clock.currentTimeMillis` or `Clock.currentTimeNanos` reads real time and invalidates caching. Use persisted status or a coarse time argument for time-sensitive screens. Mutations and actions do not use those query stubs. Keep filesystem, external-network, and process services out of query/mutation Layers. [Confect determinism](https://confect.dev/v10/server/database/determinism.md).

### Async work and resource ownership

Use `Effect.tryPromise` only at an external Promise boundary and map its failure. Pass the interruption signal where the library supports it. Cancellation can stop local waiting and owned work; it cannot undo a Convex mutation that was already dispatched. The mutation must use an idempotency key and base-version check.

Use scopes and acquire/release for files, child processes, subscriptions, and runtime resources. Attach heartbeat and progress fibers to the job scope so they end with the attempt. Use bounded concurrency for document rendering and page conversion, and bounded buffers/Streams for process output. Never let an unbounded `Promise.all` or detached fiber own a render job.

Retry only known transient failures, with bounded backoff. A template mismatch, locked Word file, invalid document, lost lease, or stale revision needs its own response. An Effect timeout must also close the resource scope; verify that the adapter terminates only the process tree it started. Retained Windows rendering rules still apply.

Use Effect Config at composition roots and injected services for configuration-dependent behavior. Doppler `ha-workspace` / `dev_personal` supplies all application environment values through `doppler run --no-fallback`; do not read app `.env` files or embed fallback secrets. Decode required values once, keep secrets redacted, and export only allowlisted public configuration to the browser. Doppler CLI authentication is pending reauthentication, so the injection path still needs verification. Name use-case spans and record job IDs, file-version IDs, attempts, stage durations and outcomes. Read random values and time through the appropriate runtime services; inside Convex, use its deterministic environment and Confect services.

## The local Drive is an Effect adapter

Add a focused `FileProvider` port under the catalog/application boundary. Its operations return typed Effect values for listing metadata, reading versioned content, staging bytes, and exclusively publishing a new filename. Implement the first Layer against `/home/akh/Projects/ha-workspace-data/fake-drive`. Read the provider root from Doppler configuration; application use cases accept IDs and validated references, never arbitrary absolute paths from the browser.

The sole standalone copy is `fake-drive`. The original selected Google Drive mirror is outside the adapter's write authority. The provider must preserve existing files, reject path traversal and symlink escapes, verify hashes, and publish with exclusive creation. Treat failed-sync artifacts and `.lnk` shortcuts as opaque imported files; do not execute or dereference them while indexing. Exclude `sync.ffs_lock`, `sync.ffs_db`, and `*.ffs_tmp` from catalog ingestion and all active provider operations, while retaining their copied bytes inert in the snapshot. Never register the working copy with FreeFileSync. Another task owns live mirror/sync repairs; this provider stays independent of that process. A later cloud implementation of this port should leave the use cases and Atom state graph intact.

Use scoped streams for content and bounded concurrency for metadata extraction. Emit typed `FileMissing`, `ContentChanged`, `UnsupportedPreview`, and `PublicationConflict` outcomes where relevant. A file without a supported preview still has a visible row, provenance, and download action. Keep original filenames and folder relationships; classification into Reports/Invoices/Templates is metadata, so it does not reorganize the source tree.

Adapter checks must prove that writes stay under the working provider root, existing destinations cannot be replaced, and a failed or cancelled operation does not change the original source or replace existing provider files. A full cloud inventory is a separate future check; local-copy verification establishes only the selected mirror's contents.

## Transactions and durable jobs

Convex mutations define transaction boundaries. Authorize a revision request, compare its base revision, capture context, and enqueue its job in one mutation. On completion, recheck the base revision, running state, cancellation, unexpired lease, and attempt fencing token; record the ready revision/preview metadata and advance the visible version together. Multiple mutation calls from a worker or action are separate transactions. [Convex mutations](https://docs.convex.dev/functions/mutation-functions), [Convex actions](https://docs.convex.dev/functions/actions).

Use ports that name these invariants, such as `RevisionStore.commitValidatedRevision`. A generic `find`/`save`/`update` repository must not conceal the fact that several calls are not atomic. Keep transaction-scoped services inside a single function invocation. Cross-feature operations contributing to one invariant call transaction-bound module helpers in that invocation, not separate remote mutations.

Scope an idempotency key by owner and operation, and bind it to a canonical request fingerprint. The same key and payload return the existing job; the same key with a different payload returns `IdempotencyConflict`.

Persist job state, lease, attempt token and cancellation in Convex. Effect fibers manage one live attempt and end when their process ends. Schema unions and explicit transition functions should reject invalid job-state changes.

File writes and database changes cannot commit atomically. Render attempts stage immutable bytes, verify their hash, and commit the ready revision metadata. They cannot write a final destination directly.

Final publication is a separate command referencing an already committed immutable revision. Its intent freezes the revision ID/hash, canonical new destination, and operation ID. Write those exact bytes with exclusive creation and no replacement. On replay, matching bytes complete the existing intent; different bytes return a typed `PublicationConflict`. Recheck any Word owner lock immediately before publication. Restart recovery can then distinguish an unwritten file, an already-correct file, and a conflict. An expired render attempt has no authority to publish a candidate.

Confect does not remove Convex runtime restrictions. Queries and mutations cannot do filesystem work, external calls, retry sleeps, or background fibers. Self-hosted Node actions use the local backend’s runtime; inspect it separately from the development toolchain. [Convex runtimes](https://docs.convex.dev/functions/runtimes).

## Implementation review and tests

Use Vite+'s Vitest runner with the matching Effect test integration and Confect test helpers. Pin `@effect/vitest` to RC.112; `it.effect` supplies a scope and test services, and v4 exports `TestClock` from `effect/testing`. Fake Layers should make failures, clocks, and cancellation controllable. [Pinned Effect test guidance](https://raw.githubusercontent.com/Effect-TS/effect/effect%404.0.0-rc.112/packages/vitest/README.md). Configure test matching for `.test.ts`, since Confect uses `.spec.ts` for API definitions. Add a Bun runtime smoke suite for real process/file behavior; it complements the domain suite.

Acceptance requires:

1. The dependency graph rejects browser imports of server code and core imports of infrastructure adapters.
2. Report/invoice use cases run with fake services and no browser, network, Convex backend, or renderer process.
3. A general report chooses the authorized template; Dulles chooses its exact exception; cross-client billing evidence fails before generation.
4. Concurrent submissions with the same scoped request ID and payload create one logical job; a changed payload returns `IdempotencyConflict`. A stale base revision returns a typed conflict.
5. An expired worker lease cannot commit, even before another worker claims the job. An old attempt token also fails after a new claim.
6. Cancellation closes the job scope, stops its process tree, and prevents a late result from becoming the visible revision.
7. Restart after staging bytes or writing a final file reconciles state without duplicate publication. Publication freezes a committed revision; replay accepts only matching bytes and rejects destination conflicts.
8. Failed rendering, namespace incompatibility, or a Word owner lock preserves the latest ready revision.
9. Instruction changes affect the next run while an active run keeps its snapshot.
10. Two consumers of an equivalent query share its atom/subscription; reconnect does not duplicate listeners, and a declared query error can recover on a later update.
11. Registry/session teardown closes streams and clients; StrictMode remounts work, and concurrent SSR requests cannot see another owner’s state.
12. Drafts survive route changes and reload; a base revision change creates a conflict without losing the draft. Command acknowledgement and durable job completion have distinct UI states.
13. The chosen Bun/Node toolchain builds the app, generates Confect code, serves Start production output, and completes a real document-worker test.

Code review should be able to follow a use case from its schema through its service calls to a typed result without finding hidden I/O, a private runtime, or a second implementation of the same rule.

## Checked Atom stream adapter

The bridge below converts result events into UI state without turning recoverable query errors into a terminal stream failure. It passed strict compilation against Effect RC.112. A fake-stream test confirmed shared subscriptions, recovery from a typed failure, preservation of the last success, registry isolation, and disposal of listeners and Layers.

`atom-react-sample.tsx` and `atom-auth.mts` also passed typechecking with Confect next.21, React 19.2.4, and scheduler 0.27.0. These are isolated API probes. The React fixture uses an illustrative local URL, simplified public refs, and temporary draft state; production uses the confirmed endpoint, authenticated generated refs, revision checks, and durable draft storage. No live Convex, browser mount, authentication handshake, or Bun integration was tested. `ATOM-VERIFICATION.md` records the exact checks and sources.

```ts
import { Cause, Result, Stream } from "effect"
import { AsyncResult, Atom } from "effect/unstable/reactivity"

// This maps query failures to UI values; it does not fail the subscription.
export function fromResultStream<A, E, R, ER>(
  runtime: Atom.AtomRuntime<R, ER>,
  stream: Stream.Stream<Result.Result<A, E>, never, R>,
): Atom.Atom<AsyncResult.AsyncResult<A, E | ER | Cause.NoSuchElementError>> {
  type State = AsyncResult.AsyncResult<A, E | ER | Cause.NoSuchElementError>
  const source = runtime.atom(stream)
  return Atom.make((get): State =>
    AsyncResult.flatMap(get(source), (result, previous) =>
      Result.match(result, {
        onSuccess: (value) =>
          AsyncResult.success(value, {
            waiting: previous.waiting,
            timestamp: previous.timestamp,
          }),
        onFailure: (error) =>
          AsyncResult.failWithPrevious(error, {
            previous: get.self<State>(),
            waiting: previous.waiting,
          }),
      }),
    ),
  )
}
```
