# Effect Atom RC112 research verification

Temporary research only. No application scaffold or live Convex calls.

Pinned package shape checks:

- effect and @effect/atom-react 4.0.0-rc.112
- @confect/js and @confect/core 10.0.0-next.21
- convex 1.45.0, React 19.2.4, scheduler 0.27.0 used in compile fixture.
- React bindings import from @effect/atom-react; Atom, AtomRegistry, AsyncResult import from effect/unstable/reactivity.

Passed compile command:
./node_modules/.bin/tsc --strict --module esnext --moduleResolution bundler --target es2022 --jsx react-jsx --skipLibCheck --outDir checked atom-bridge.mts atom-behavior.mts atom-auth.mts atom-react-sample.tsx

Passed runtime command:
node checked/atom-behavior.mjs

Assertions passed: canonical Atom.family key returns the same atom; two observers use one stream subscription; success -> typed failure -> success recovers without resubscribing; failure retains previousSuccess; the same runtime declaration builds isolated service instances and state in two registries; disposal closes both subscriptions and both layer resources.

Fixture scope:

- atom-bridge.mts: generic nonterminating Result stream -> AsyncResult adapter, preserves previousSuccess.
- atom-react-sample.tsx: public Confect ref factory and stream/mutation shapes, Atom runtime, family, state, React hooks/provider. Production should use generated refs, authenticated session layer and real per-attempt IDs. This fixture is typechecked, not browser mounted.
- atom-auth.mts: typechecked session client layer + setAuth registration. Registration is not auth confirmation. Production must expose auth-ready state and gate protected reads.
- atom-behavior.mts: executable fake stream/resource harness; no live WebSocket client.

Primary sources checked:
https://registry.npmjs.org/@effect/atom-react/4.0.0-rc.112
https://registry.npmjs.org/@confect/js/10.0.0-next.21
https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/reactivity/Atom.ts
https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/unstable/reactivity/AsyncResult.ts
https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/atom/react/src/RegistryContext.ts
https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/atom/react/src/Hooks.ts
https://confect.dev/v10/clients/js/websocket.md

Published source observations:

- RegistryProvider owns a stable registry, passes initial options once, and defers dispose by 500ms on unmount; timeout is cancelled on StrictMode remount.
- Default RegistryContext is a global standalone registry, so application and SSR must explicitly provide ownership boundaries.
- Atom.runtime uses registry-scoped layer memoization in this RC. Avoid explicit shared memo maps across authenticated sessions.
- Confect reactiveQueryResult converts onError and codec errors into Result values. Established listeners remain open through query error events; encoding failure before a subscription exists yields a single failure and completes.
- Confect WebSocket layer acquires/closes its ConvexClient as a scoped resource. Each reactive subscription unregisters in its stream finalizer.
- Atom.fn without concurrent:true invalidates prior invocation, interrupting its local effect. This cannot undo dispatched mutations. Use disabled/single-flight form commands and idempotency keys; separate atom instances for independent commands.
- Atom.kvs uses schema codec storage; even async mode advances writes optimistically through an internal command atom. Do not rely on its UI value as proof that important drafts persisted. Use explicit draft save/load use cases with visible error state.
