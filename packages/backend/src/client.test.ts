import { it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Queue, Result, Schema, Stream } from "effect"
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity"
import { expect } from "vite-plus/test"

import { fromResultStream } from "./client"

class QueryUnavailable extends Schema.TaggedError<QueryUnavailable>()("QueryUnavailable", {
  reason: Schema.String,
}) {}

it.effect("shares live reads, recovers from query failures, and scopes each session", () =>
  Effect.gen(function* () {
    type Event = Result.Result<number, QueryUnavailable>
    const opened = yield* Queue.unbounded<Queue.Enqueue<Event>>()
    const finalized = yield* Queue.unbounded<string>()
    let connections = 0
    let subscriptions = 0
    const Connection = Context.Service<number>("test/catalog/Connection")
    const runtime = Atom.runtime(
      Layer.effect(
        Connection,
        Effect.acquireRelease(
          Effect.sync(() => ++connections),
          () => Queue.offer(finalized, "layer"),
        ),
      ),
    )
    const events = Stream.unwrap(
      Effect.gen(function* () {
        yield* Connection
        return Stream.callback<Event>((queue) =>
          Effect.gen(function* () {
            subscriptions++
            yield* Queue.offer(opened, queue)
            yield* Effect.addFinalizer(() => Queue.offer(finalized, "subscription"))
          }),
        )
      }),
    )
    const atom = fromResultStream(runtime, events)
    const makeRegistry = Effect.acquireRelease(
      Effect.sync(() => AtomRegistry.make()),
      (registry) => Effect.sync(() => registry.dispose()),
    )
    const first = yield* makeRegistry
    const second = yield* makeRegistry
    const waitFor = (
      registry: AtomRegistry.AtomRegistry,
      predicate: (state: Atom.Type<typeof atom>) => boolean,
    ) =>
      AtomRegistry.toStream(registry, atom).pipe(
        Stream.filter(predicate),
        Stream.take(1),
        Stream.runDrain,
      )

    first.mount(atom)
    first.mount(atom)
    const firstSource = yield* Queue.take(opened)
    expect(connections).toBe(1)
    expect(subscriptions).toBe(1)

    yield* Queue.offer(firstSource, Result.succeed(7))
    yield* waitFor(first, (state) => AsyncResult.isSuccess(state) && state.value === 7)
    const error = new QueryUnavailable({ reason: "Temporarily unavailable" })
    yield* Queue.offer(firstSource, Result.fail(error))
    yield* waitFor(first, AsyncResult.isFailure)
    const failure = first.get(atom)
    expect(AsyncResult.isFailure(failure)).toBe(true)
    if (AsyncResult.isFailure(failure)) {
      expect(Option.map(failure.previousSuccess, (success) => success.value)).toEqual(
        Option.some(7),
      )
      const propagated = yield* AtomRegistry.getResult(first, atom).pipe(Effect.flip)
      expect(propagated).toBe(error)
    }

    yield* Queue.offer(firstSource, Result.succeed(8))
    yield* waitFor(first, (state) => AsyncResult.isSuccess(state) && state.value === 8)
    expect(subscriptions).toBe(1)

    second.mount(atom)
    const secondSource = yield* Queue.take(opened)
    expect(secondSource).not.toBe(firstSource)
    expect(connections).toBe(2)
    expect(AsyncResult.isInitial(second.get(atom))).toBe(true)

    first.dispose()
    second.dispose()
    const releases = yield* Effect.all(Array.from({ length: 4 }, () => Queue.take(finalized)))
    expect(releases.sort()).toEqual(["layer", "layer", "subscription", "subscription"])
  }),
)
