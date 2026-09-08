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
