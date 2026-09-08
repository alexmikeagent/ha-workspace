import { Context, Effect, Schema } from "effect"

export class WorkspaceClientError extends Schema.TaggedError<WorkspaceClientError>()(
  "WorkspaceClientError",
  { message: Schema.String },
) {}

export const Session = Schema.Struct({
  token: Schema.String,
  expiresAt: Schema.Number,
  subject: Schema.String,
  convexUrl: Schema.String,
})

export const requestJson = Effect.fn("workspace.requestJson")(function* (path: string) {
  const response = yield* Effect.tryPromise({
    try: (signal) => fetch(path, { signal, credentials: "same-origin", cache: "no-store" }),
    catch: () => new WorkspaceClientError({ message: "The local workspace is unreachable." }),
  })
  if (!response.ok) {
    return yield* new WorkspaceClientError({
      message:
        response.status === 401
          ? "Your local session ended. Reload the workspace to reconnect."
          : response.status === 404
            ? "This file or revision is no longer available."
            : "The workspace could not complete this request. Please try again.",
    })
  }
  return yield* Effect.tryPromise({
    try: (): Promise<unknown> => response.json(),
    catch: () =>
      new WorkspaceClientError({ message: "The workspace returned an unreadable response." }),
  })
})

export const readSession = requestJson("/api/session").pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(Session)),
  Effect.mapError(
    () =>
      new WorkspaceClientError({
        message:
          "The local session could not be opened. Check that the workspace server is running, then retry.",
      }),
  ),
)

const Draft = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  body: Schema.String,
  idempotencyKey: Schema.String,
})
export type Draft = typeof Draft.Type

const storageError = () =>
  new WorkspaceClientError({
    message: "Your draft is still here, but this browser could not save it. Keep this page open.",
  })

// IndexedDB owns only review drafts. Session credentials never enter this store.
const openDraftDatabase = Effect.tryPromise({
  try: () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("ha-workspace-drafts", 1)
      request.onupgradeneeded = () => request.result.createObjectStore("review-drafts")
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error("Draft database upgrade is blocked"))
    }),
  catch: storageError,
})

const withDatabase = <A>(operation: (db: IDBDatabase) => Promise<A>) =>
  Effect.acquireUseRelease(
    openDraftDatabase,
    (db) => Effect.tryPromise({ try: () => operation(db), catch: storageError }),
    (db) => Effect.sync(() => db.close()),
  )

export class DraftStore extends Context.Service<
  DraftStore,
  {
    readonly read: (key: string) => Effect.Effect<Draft | null, WorkspaceClientError>
    readonly write: (key: string, draft: Draft) => Effect.Effect<void, WorkspaceClientError>
  }
>()("ha/workspace/DraftStore") {}

export const browserDraftStore = {
  read: Effect.fn("reviewDraft.read")(function* (key: string) {
    const value = yield* withDatabase(
      (db) =>
        new Promise<unknown>((resolve, reject) => {
          const request = db
            .transaction("review-drafts", "readonly")
            .objectStore("review-drafts")
            .get(key)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        }),
    )
    if (value === undefined) return null
    return yield* Schema.decodeUnknownEffect(Draft)(value).pipe(Effect.mapError(storageError))
  }),
  write: (key: string, draft: Draft) =>
    withDatabase(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const transaction = db.transaction("review-drafts", "readwrite")
          transaction.objectStore("review-drafts").put(draft, key)
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        }),
    ),
}

export function clientErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }
  return "The connection was interrupted. Your work is still here; try again when the workspace is available."
}
