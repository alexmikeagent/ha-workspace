import { Context, Effect, Layer, Option, Queue, Result, Stream } from "effect"
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity"
import { fromResultStream } from "./atom-bridge.mjs"

let acquired = 0
let released = 0
let subscriptions = 0
let unsubscribed = 0
const emit = new Map<number, (value: Result.Result<number, string>) => void>()
const Session = Context.Service<number>("test/Session")
const layer = Layer.effect(
  Session,
  Effect.acquireRelease(
    Effect.sync(() => ++acquired),
    () =>
      Effect.sync(() => {
        released++
      }),
  ),
)
const app = Atom.runtime(layer)
const query = Atom.family((key: string) => {
  const events = Stream.unwrap(
    Effect.gen(function* () {
      const session = yield* Session
      return Stream.callback<Result.Result<number, string>>((queue) =>
        Effect.gen(function* () {
          subscriptions++
          emit.set(session, (value) => {
            Queue.offerUnsafe(queue, value)
          })
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              emit.delete(session)
              unsubscribed++
            }),
          )
        }),
      )
    }),
  )
  return fromResultStream(app, events)
})
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))
const assert = (ok: boolean, message: string) => {
  if (!ok) throw new Error(message)
}
const a = AtomRegistry.make()
const b = AtomRegistry.make()
const target = query("canonical-file-key")
assert(target === query("canonical-file-key"), "Family key did not reuse atom")
a.mount(app)
a.mount(target)
a.subscribe(target, () => {})
await tick()
assert(acquired === 1 && subscriptions === 1, "Duplicate observer opened another subscription")
emit.get(1)!(Result.succeed(7))
await tick()
let state = a.get(target)
assert(AsyncResult.isSuccess(state) && state.value === 7, "Initial result missing")
emit.get(1)!(Result.fail("temporary"))
await tick()
state = a.get(target)
assert(AsyncResult.isFailure(state), "Typed failure was not visible")
if (AsyncResult.isFailure(state)) {
  assert(
    Option.isSome(state.previousSuccess) && state.previousSuccess.value.value === 7,
    "Previous success was lost",
  )
}
emit.get(1)!(Result.succeed(8))
await tick()
state = a.get(target)
assert(AsyncResult.isSuccess(state) && state.value === 8, "Subscription did not recover")
assert(subscriptions === 1, "Recovery resubscribed")
b.mount(app)
b.mount(target)
await tick()
assert(acquired === 2 && subscriptions === 2, "Runtime leaked across registries")
assert(AsyncResult.isInitial(b.get(target)), "Second registry saw first registry state")
a.dispose()
b.dispose()
await tick()
assert(released === 2 && unsubscribed === 2, "Registry disposal failed to release resources")
console.log(
  "RC112 Atom PASS: canonical family, one subscription, success-failure-success recovery, previousSuccess, isolated registries, layer and subscription cleanup",
)
