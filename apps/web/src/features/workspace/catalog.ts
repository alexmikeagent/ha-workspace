import { api } from "@ha/backend/api"
import { fromResultStream } from "@ha/backend/client"
import { WebSocketClient } from "@confect/js"
import { Context, Deferred, Effect, Layer, Ref, Schema, Stream } from "effect"
import { Atom } from "effect/unstable/reactivity"
import {
  DraftStore,
  browserDraftStore,
  readSession,
  requestJson,
  WorkspaceClientError,
  type Draft,
} from "./browser-services"
import type { WorkspaceSearch } from "./state"

class WorkspaceConnection extends Context.Service<
  WorkspaceConnection,
  {
    readonly client: Context.Service.Shape<typeof WebSocketClient.WebSocketClient>
    readonly subject: string
  }
>()("ha/workspace/WorkspaceConnection") {}

// The client-only route mounts this layer. One registry owns one authenticated
// WebSocket; its scope releases subscriptions and the client together.
const connectionLayer = Layer.unwrap(
  Effect.gen(function* () {
    const session = yield* readSession
    return Layer.effect(
      WorkspaceConnection,
      Effect.gen(function* () {
        const client = yield* WebSocketClient.WebSocketClient
        const token = yield* Ref.make(session.token)
        const ready = yield* Deferred.make<void, WorkspaceClientError>()
        yield* client.setAuth(
          ({ forceRefreshToken }) =>
            forceRefreshToken
              ? readSession.pipe(
                  Effect.tap((next) => Ref.set(token, next.token)),
                  Effect.match({ onSuccess: (next) => next.token, onFailure: () => null }),
                )
              : Ref.get(token),
          (authenticated) =>
            authenticated
              ? Deferred.succeed(ready, undefined).pipe(Effect.asVoid)
              : Deferred.fail(
                  ready,
                  new WorkspaceClientError({
                    message:
                      "The local workspace could not authenticate. Reload to start a fresh session.",
                  }),
                ).pipe(Effect.asVoid),
        )
        yield* Deferred.await(ready).pipe(
          Effect.timeout("20 seconds"),
          Effect.mapError(
            () =>
              new WorkspaceClientError({
                message:
                  "The workspace connection did not become ready. Check the local service and try again.",
              }),
          ),
        )
        return { client, subject: session.subject }
      }),
    ).pipe(Layer.provide(WebSocketClient.layer(session.convexUrl)))
  }),
)

export const workspaceRuntime = Atom.runtime(
  Layer.merge(connectionLayer, Layer.succeed(DraftStore, browserDraftStore)),
)

export function catalogKey(search: WorkspaceSearch) {
  return JSON.stringify({
    search: search.q ?? "",
    companyId: search.company ?? "",
    projectId: search.project ?? "",
    category: search.section === "companies" ? "" : search.section,
  })
}
const CatalogFilter = Schema.Struct({
  search: Schema.String,
  companyId: Schema.String,
  projectId: Schema.String,
  category: Schema.String,
})

export const workspaceCatalog = Atom.family((key: string) =>
  fromResultStream(
    workspaceRuntime,
    Stream.unwrap(
      Effect.gen(function* () {
        const { client } = yield* WorkspaceConnection
        const filter = Schema.decodeUnknownSync(Schema.fromJsonString(CatalogFilter))(key)
        return client.reactiveQueryResult(api.workspace.catalog, {
          ...(filter.search ? { search: filter.search } : {}),
          ...(filter.companyId ? { companyId: filter.companyId } : {}),
          ...(filter.projectId ? { projectId: filter.projectId } : {}),
          ...(filter.category ? { category: filter.category } : {}),
        })
      }),
    ),
  ),
)
export const workspaceFile = Atom.family((fileId: string) =>
  fromResultStream(
    workspaceRuntime,
    Stream.unwrap(
      Effect.gen(function* () {
        const { client } = yield* WorkspaceConnection
        return client.reactiveQueryResult(api.workspace.fileDetails, { fileId })
      }),
    ),
  ),
)

export interface ReviewDraftState {
  readonly body: string
  readonly idempotencyKey: string
  readonly loaded: boolean
  readonly saving: boolean
  readonly saved: boolean
  readonly error: string | null
}
export const reviewDraft = Atom.family((_key: string) =>
  Atom.make<ReviewDraftState>({
    body: "",
    idempotencyKey: "",
    loaded: false,
    saving: false,
    saved: false,
    error: null,
  }).pipe(Atom.keepAlive),
)
export const loadReviewDraft = Atom.family((key: string) =>
  workspaceRuntime.atom((get) =>
    Effect.gen(function* () {
      if (get.once(reviewDraft(key)).loaded) return
      const { subject } = yield* WorkspaceConnection
      const store = yield* DraftStore
      const loaded = yield* store.read(`${subject}:${key}`).pipe(
        Effect.match({
          onSuccess: (value) => ({ value, error: null }),
          onFailure: (error) => ({ value: null, error: error.message }),
        }),
      )
      const idempotencyKey = yield* Effect.sync(() => crypto.randomUUID())
      get.set(reviewDraft(key), {
        body: loaded.value?.body ?? "",
        idempotencyKey: loaded.value?.idempotencyKey ?? idempotencyKey,
        loaded: true,
        saving: false,
        saved: loaded.error === null,
        error: loaded.error,
      })
    }),
  ),
)
export const editReviewDraft = Atom.family((key: string) =>
  workspaceRuntime
    .fn((body: string, get) =>
      Effect.gen(function* () {
        const { subject } = yield* WorkspaceConnection
        const store = yield* DraftStore
        const idempotencyKey = yield* Effect.sync(() => crypto.randomUUID())
        get.set(reviewDraft(key), {
          body,
          idempotencyKey,
          loaded: true,
          saving: true,
          saved: false,
          error: null,
        })
        yield* Effect.sleep("250 millis")
        const error = yield* store
          .write(`${subject}:${key}`, { schemaVersion: 1, body, idempotencyKey })
          .pipe(Effect.match({ onSuccess: () => null, onFailure: (error) => error.message }))
        const current = get(reviewDraft(key))
        if (current.idempotencyKey === idempotencyKey)
          get.set(reviewDraft(key), { ...current, saving: false, saved: error === null, error })
      }),
    )
    .pipe(Atom.keepAlive),
)
export const addReviewComment = Atom.family((key: string) =>
  workspaceRuntime.fn((input: { fileId: string; versionId: string; draft: Draft }, get) =>
    Effect.gen(function* () {
      const { client, subject } = yield* WorkspaceConnection
      const store = yield* DraftStore
      const result = yield* client.mutation(api.workspace.addComment, {
        fileId: input.fileId,
        versionId: input.versionId,
        body: input.draft.body,
        idempotencyKey: input.draft.idempotencyKey,
      })
      const current = get(reviewDraft(key))
      if (current.idempotencyKey === input.draft.idempotencyKey) {
        const idempotencyKey = yield* Effect.sync(() => crypto.randomUUID())
        const error = yield* store
          .write(`${subject}:${key}`, { schemaVersion: 1, body: "", idempotencyKey })
          .pipe(Effect.match({ onSuccess: () => null, onFailure: (error) => error.message }))
        get.set(reviewDraft(key), {
          body: "",
          idempotencyKey,
          loaded: true,
          saving: false,
          saved: error === null,
          error,
        })
      }
      return result
    }),
  ),
)

export const RevisionDraft = Schema.Struct({ find: Schema.String, replacement: Schema.String })
export const readRevisionDraft = Schema.decodeUnknownOption(Schema.fromJsonString(RevisionDraft))

export const requestRevision = Atom.family((_key: string) =>
  workspaceRuntime
    .fn((input: { fileId: string; versionId: string; draft: Draft }) =>
      Effect.gen(function* () {
        const { client } = yield* WorkspaceConnection
        const change = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(RevisionDraft))(
          input.draft.body,
        )
        return yield* client.mutation(api.workspace.requestRevision, {
          fileId: input.fileId,
          baseVersionId: input.versionId,
          find: change.find,
          replacement: change.replacement,
          requestId: input.draft.idempotencyKey,
        })
      }),
    )
    .pipe(Atom.keepAlive),
)

export const cancelRevision = Atom.family((jobId: string) =>
  workspaceRuntime.fn(() =>
    Effect.gen(function* () {
      const { client } = yield* WorkspaceConnection
      return yield* client.mutation(api.workspace.cancelRevision, { jobId })
    }),
  ),
)

export const versionUrl = (
  fileId: string,
  versionId: string,
  operation: "preview" | "content" | "download",
) =>
  `/api/files/${encodeURIComponent(fileId)}/versions/${encodeURIComponent(versionId)}/${operation}`

export const PreviewInfo = Schema.Struct({
  kind: Schema.Literals(["pdf", "image", "text", "spreadsheet", "unsupported", "failed"]),
  url: Schema.optional(Schema.String),
  text: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  sheets: Schema.optional(
    Schema.Array(
      Schema.Struct({ name: Schema.String, rows: Schema.Array(Schema.Array(Schema.String)) }),
    ),
  ),
  truncated: Schema.optional(Schema.Boolean),
})
export const previewInfo = Atom.family((url: string) =>
  workspaceRuntime.atom(
    requestJson(url).pipe(Effect.flatMap(Schema.decodeUnknownEffect(PreviewInfo))),
  ),
)
