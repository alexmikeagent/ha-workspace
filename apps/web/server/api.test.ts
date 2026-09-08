import { it } from "@effect/vitest"
import { LocalAuth, SessionError } from "@ha/backend/local-auth"
import { DriveError, DriveStore, type StoredFile } from "@ha/documents/drive-store"
import { PreviewStore } from "@ha/documents/preview"
import { Effect, Layer } from "effect"
import { expect } from "vite-plus/test"
import { LocalApi, LocalApiLive, LocalApiSettings, LocalFileResponse } from "./api"
import { downloadDisposition, privateHeaders, sessionCookieName } from "./security"

const fileId = "a".repeat(64)
const versionId = "b".repeat(64)
const filePath = `/api/files/${fileId}/versions/${versionId}`
const identity = {
  sub: "local:akh",
  sessionId: "existing-session",
  role: "owner",
  workspaceId: "ha-workspace",
} as const
const record: StoredFile = {
  relativePath: "Example/example.docx",
  file: {
    id: fileId,
    name: 'Résumé "final".docx',
    companyId: null,
    projectId: null,
    category: "report",
    extension: "docx",
    size: 20,
    modifiedAt: 1,
    importedAt: 1,
    currentVersionId: versionId,
    sha256: "c".repeat(64),
    sourceLabel: "Example",
  },
}

function fixture(errorCode?: string) {
  const calls: string[] = []
  const failure = () =>
    new DriveError({ code: errorCode ?? "NotFound", message: "The copied version is unavailable." })
  const access = <A>(operation: string, value: A) =>
    Effect.sync(() => {
      calls.push(operation)
    }).pipe(Effect.flatMap(() => (errorCode ? Effect.fail(failure()) : Effect.succeed(value))))
  const layer = LocalApiLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(LocalAuth, {
          issue: () =>
            Effect.sync(() => {
              calls.push("issue")
              return "minted-token"
            }),
          verify: (token) =>
            token === "owner-token"
              ? Effect.succeed(identity)
              : token === "importer-token"
                ? Effect.succeed({ ...identity, role: "importer" as const })
                : Effect.fail(new SessionError({ message: "Expired." })),
        }),
        Layer.succeed(LocalApiSettings, {
          policy: { authorities: new Set(["127.0.0.1:4310", "127.0.0.1:4312"]) },
          convexUrl: "http://127.0.0.1:3220",
        }),
        Layer.succeed(DriveStore, {
          driveRoot: "/private/drive",
          dataRoot: "/private/data",
          scan: () => Effect.die("The HTTP adapter must never import implicitly."),
          recordRevision: () => Effect.die("Read-only HTTP endpoints must not publish revisions."),
          index: () =>
            access("index", {
              importedAt: 1,
              companies: [],
              projects: [],
              files: [],
              versions: {},
            }),
          resolve: () => access("resolve", { path: "/private/drive/example.docx", record }),
        }),
        Layer.succeed(PreviewStore, {
          preview: () => access("preview", { kind: "pdf" as const, url: `${filePath}/content` }),
          content: () =>
            access("content", { path: "/private/previews/example.pdf", mime: "application/pdf" }),
          context: () =>
            access("context", {
              text: "Example context",
              source: "document" as const,
              truncated: false,
              notes: ["Reference material"],
            }),
        }),
        Layer.succeed(LocalFileResponse, {
          serve: (_path, mime, name) =>
            Effect.sync(() => {
              calls.push("serve")
              return new Response("example bytes", {
                headers: privateHeaders({
                  "Content-Type": mime,
                  ...(name ? { "Content-Disposition": downloadDisposition(name) } : {}),
                }),
              })
            }),
        }),
      ),
    ),
  )
  const handle = (request: Request, remote: string | undefined = "127.0.0.1") =>
    Effect.gen(function* () {
      return yield* (yield* LocalApi).handle(request, remote)
    }).pipe(Effect.provide(layer))
  return { calls, handle }
}

function request(
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {},
) {
  return new Request(`http://127.0.0.1:4310${path}`, {
    method: options.method ?? "GET",
    headers: { host: "127.0.0.1:4310", "sec-fetch-site": "same-origin", ...options.headers },
  })
}
const authenticated = (path: string, token = "owner-token") =>
  request(path, { headers: { cookie: `${sessionCookieName}=${token}` } })
const readJson = (response: Response) => Effect.promise(() => response.json() as Promise<unknown>)

it.effect("bootstraps a private owner session and keeps an existing session identity", () =>
  Effect.gen(function* () {
    const api = fixture()
    const response = yield* api.handle(authenticated("/api/session"))
    expect(response.status).toBe(200)
    expect(yield* readJson(response)).toMatchObject({
      sessionId: identity.sessionId,
      subject: identity.sub,
      token: "minted-token",
      convexUrl: "http://127.0.0.1:3220",
    })
    const cookie = response.headers.get("set-cookie")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Strict")
    expect(cookie).toContain("Path=/api")
    expect(cookie).toContain("Max-Age=28800")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.has("access-control-allow-origin")).toBe(false)
    expect(api.calls).toEqual(["issue"])
  }),
)

it.effect.each([
  { origin: "https://foreign.example" },
  { origin: "null" },
  { origin: "http://127.0.0.1:9999" },
  { "sec-fetch-site": "cross-site" },
  { "sec-fetch-site": "same-site" },
  { host: "127.0.0.1.attacker.example:4310" },
  { host: "attacker.example:4310" },
  { host: "127.0.0.1:9999" },
] as Record<string, string>[])(
  "blocks foreign origins and rebinding before issuing credentials: %j",
  (headers) =>
    Effect.gen(function* () {
      const api = fixture()
      const response = yield* api.handle(request("/api/session", { headers }))
      expect(response.status).toBe(403)
      expect(response.headers.has("set-cookie")).toBe(false)
      expect(api.calls).toEqual([])
    }),
)

it.effect("rejects a non-loopback peer even when it spoofs browser headers", () =>
  Effect.gen(function* () {
    const api = fixture()
    expect((yield* api.handle(request("/api/session"), "192.168.1.10")).status).toBe(403)
    expect(api.calls).toEqual([])
  }),
)

it.effect.each(["HEAD", "POST", "OPTIONS"])(
  "rejects %s without granting CORS or minting a session",
  (method) =>
    Effect.gen(function* () {
      const api = fixture()
      const response = yield* api.handle(request("/api/session", { method }))
      expect(response.status).toBe(405)
      expect(response.headers.get("allow")).toBe("GET")
      expect(response.headers.has("access-control-allow-origin")).toBe(false)
      expect(api.calls).toEqual([])
    }),
)

it.effect.each(["preview", "content", "context", "download"])(
  "requires a valid owner cookie for %s",
  (operation) =>
    Effect.gen(function* () {
      const api = fixture()
      expect((yield* api.handle(request(`${filePath}/${operation}`))).status).toBe(401)
      expect(
        (yield* api.handle(authenticated(`${filePath}/${operation}`, "expired-token"))).status,
      ).toBe(401)
      expect(
        (yield* api.handle(authenticated(`${filePath}/${operation}`, "importer-token"))).status,
      ).toBe(403)
      expect(api.calls).toEqual([])
    }),
)

it.effect("rejects duplicate cookies and opaque-ID traversal before any file access", () =>
  Effect.gen(function* () {
    const api = fixture()
    const duplicated = request(`${filePath}/preview`, {
      headers: { cookie: `${sessionCookieName}=owner-token; ${sessionCookieName}=other-token` },
    })
    expect((yield* api.handle(duplicated)).status).toBe(401)
    expect(
      (yield* api.handle(
        authenticated(`/api/files/%2e%2e%2fprivate/versions/${versionId}/content`),
      )).status,
    ).toBe(404)
    expect(
      (yield* api.handle(authenticated(`${filePath}/content?path=/private/secret`))).status,
    ).toBe(400)
    expect(api.calls).toEqual([])
  }),
)

it.effect("serves the preview contract and protected file content without local paths", () =>
  Effect.gen(function* () {
    const api = fixture()
    const preview = yield* api.handle(authenticated(`${filePath}/preview`))
    expect(yield* readJson(preview)).toEqual({ kind: "pdf", url: `${filePath}/content` })
    const content = yield* api.handle(authenticated(`${filePath}/content`))
    expect(content.status).toBe(200)
    expect(content.headers.get("content-type")).toBe("application/pdf")
    expect(content.headers.get("x-content-type-options")).toBe("nosniff")
    expect(content.headers.get("cross-origin-resource-policy")).toBe("same-origin")
    const context = yield* api.handle(authenticated(`${filePath}/context`))
    expect(yield* readJson(context)).toMatchObject({ text: "Example context", source: "document" })
    expect(api.calls).toEqual(["preview", "content", "serve", "context"])
  }),
)

it.effect("downloads the resolved original with a Unicode-safe attachment filename", () =>
  Effect.gen(function* () {
    const api = fixture()
    const response = yield* api.handle(authenticated(`${filePath}/download`))
    expect(response.headers.get("content-type")).toBe("application/octet-stream")
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.docx",
    )
    expect(downloadDisposition("example\r\nInjected: yes.docx")).not.toMatch(/[\r\n]/)
    expect(api.calls).toEqual(["resolve", "serve"])
  }),
)

it.effect.each([
  ["NotFound", 404],
  ["SourceChanged", 409],
  ["InvalidDocument", 422],
  ["Unsupported", 415],
  ["TooLarge", 413],
  ["Unavailable", 503],
] as const)("maps %s to HTTP %s", ([code, status]) =>
  Effect.gen(function* () {
    const api = fixture(code)
    expect((yield* api.handle(authenticated(`${filePath}/preview`))).status).toBe(status)
    expect(api.calls).toEqual(["preview"])
  }),
)

it.effect("reports catalog readiness without disclosing file names, paths, or credentials", () =>
  Effect.gen(function* () {
    expect(yield* readJson(yield* fixture().handle(request("/api/health")))).toEqual({
      status: "ready",
      catalog: "ready",
    })
    const response = yield* fixture("Unavailable").handle(request("/api/health"))
    expect(response.status).toBe(503)
    expect(yield* readJson(response)).toEqual({ status: "starting", catalog: "unavailable" })
  }),
)
