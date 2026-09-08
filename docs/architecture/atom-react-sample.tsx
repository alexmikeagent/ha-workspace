import { FunctionSpec, Ref } from "@confect/core"
import { WebSocketClient } from "@confect/js"
import {
  RegistryProvider,
  useAtom,
  useAtomMount,
  useAtomSet,
  useAtomValue,
} from "@effect/atom-react"
import { Effect, Schema, Stream } from "effect"
import { AsyncResult, Atom } from "effect/unstable/reactivity"
import { fromResultStream } from "./atom-bridge.mjs"

// Normally these refs come from Confect codegen.
const files = Ref.make(
  "files",
  FunctionSpec.publicQuery({
    name: "get",
    args: () => ({ fileId: Schema.String }),
    returns: () => Schema.Struct({ title: Schema.String }),
  }),
)
const revise = Ref.make(
  "files",
  FunctionSpec.publicMutation({
    name: "revise",
    args: () => ({ fileId: Schema.String, requestId: Schema.String }),
    returns: () => Schema.Struct({ jobId: Schema.String }),
  }),
)

// Production provides an authenticated session layer before these atoms run.
const app = Atom.runtime(WebSocketClient.layer("http://127.0.0.1:3210"))
const titleDraft = Atom.make("").pipe(Atom.keepAlive)
const file = Atom.family((fileId: string) => {
  const updates = Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* WebSocketClient.WebSocketClient
      return client.reactiveQueryResult(files, { fileId })
    }),
  )
  return fromResultStream(app, updates)
})
const reviseFile = app.fn(
  Effect.fn("files.revise")(function* (input: { fileId: string; requestId: string }) {
    const client = yield* WebSocketClient.WebSocketClient
    return yield* client.mutation(revise, input)
  }),
)

function FilePane({ fileId, requestId }: { fileId: string; requestId: string }) {
  useAtomMount(app)
  const snapshot = useAtomValue(file(fileId))
  const command = useAtomValue(reviseFile)
  const submit = useAtomSet(reviseFile)
  const [draft, setDraft] = useAtom(titleDraft)
  return (
    <section>
      <input
        aria-label="Draft title"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <p>{AsyncResult.isSuccess(snapshot) ? snapshot.value.title : snapshot._tag}</p>
      <button disabled={command.waiting} onClick={() => submit({ fileId, requestId })}>
        Revise
      </button>
      <p aria-live="polite">{command._tag}</p>
    </section>
  )
}

export function App({ sessionId }: { sessionId: string }) {
  return (
    <RegistryProvider key={sessionId}>
      <FilePane fileId="file-1" requestId="caller-supplied-idempotency-key" />
    </RegistryProvider>
  )
}
