import { WebSocketClient } from "@confect/js"
import { Cause, Result, Stream } from "effect"
import { AsyncResult, Atom } from "effect/unstable/reactivity"

// Authentication and one session registry must own this Layer before use.
export const makeConfectClientLayer = (url: string) => WebSocketClient.layer(url)

// Recoverable query errors stay values so a later live event can recover.
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
