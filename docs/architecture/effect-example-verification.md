# Effect RC guidance verification

Temporary research only; no application scaffold or existing application dependencies were modified.

- Dependency installed: effect@4.0.0-rc.112
- TypeScript installed: 7.0.2
- Install flags: --ignore-scripts --no-audit --no-fund --save-exact
- Typecheck passed: ./node_modules/.bin/tsc --strict --noEmit --module nodenext --target es2022 --skipLibCheck sample.mts
- Runtime check passed under existing Node 26.7.0: node sample.mts
- Assertions: valid schema request produces job:test; stale base revision produces typed RevisionConflict; ManagedRuntime is disposed.
- This verifies only the illustrative API shape and fake service behavior. It does not establish Bun, Confect, Vite+, local Convex, SSR, or document worker integration compatibility.

Published RC source checks:

- Schema.TaggedError is exported. Schema.TaggedErrorClass is not.
- Schema.decodeUnknownEffect is exported.
- Context.Service, Effect.fn, ManagedRuntime.make, Layer.succeed and dispose passed the sample.
- Effect.tryPromise provides AbortSignal to its try callback.
- @effect/platform-bun RC.112 exports BunServices.layer and BunRuntime.runMain.
- @confect/react 10.0.0-next.21 typed commands return Promise<Result<A,E>>; useQuery returns QueryResult. Some narrative error documentation still says Either.

Source URLs:
https://registry.npmjs.org/effect/4.0.0-rc.112
https://registry.npmjs.org/@effect/platform-bun/4.0.0-rc.112
https://registry.npmjs.org/@confect/react/10.0.0-next.21
https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Effect.ts
https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Schema.ts
https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/ManagedRuntime.ts
https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/platform-bun/src/BunServices.ts
https://confect.dev/v10/clients/react.md
https://confect.dev/v10/server/database/determinism.md
