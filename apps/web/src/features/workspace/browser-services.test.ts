import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { Effect, Exit, Option, Cause } from "effect"
import { requestJson, readSession } from "./browser-services"

afterEach(() => vi.unstubAllGlobals())

describe("the workspace browser HTTP boundary", () => {
  it("keeps file and session requests on the same-origin cookie path without caching", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ kind: "text", text: "example" })))
    vi.stubGlobal("fetch", fetcher)
    const data = await Effect.runPromise(requestJson("/api/files/file/versions/version/preview"))
    expect(data).toEqual({ kind: "text", text: "example" })
    expect(fetcher).toHaveBeenCalledWith("/api/files/file/versions/version/preview", {
      credentials: "same-origin",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    })
  })

  it("turns expired sessions into a recoverable error without reflecting a server response body", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("private diagnostic contents", { status: 401 })),
    )
    const result = await Effect.runPromiseExit(requestJson("/api/session"))
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Option.getOrThrow(Cause.findErrorOption(result.cause))
      expect(error._tag).toBe("WorkspaceClientError")
      expect(error.message).toContain("session ended")
      expect(error.message).not.toContain("private diagnostic")
    }
  })

  it("rejects malformed session bootstrap data before a WebSocket can use it", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(Response.json({ token: "not-an-actual-credential", convexUrl: 42 })),
    )
    const result = await Effect.runPromiseExit(readSession)
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const error = Option.getOrThrow(Cause.findErrorOption(result.cause))
      expect(error._tag).toBe("WorkspaceClientError")
      expect(error.message).not.toContain("not-an-actual-credential")
    }
  })
})
