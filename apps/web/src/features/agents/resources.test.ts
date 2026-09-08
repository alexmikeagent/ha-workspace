import { afterEach, expect, it, vi } from "vite-plus/test"
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity"
import { agentLibrary } from "./resources"

afterEach(() => vi.unstubAllGlobals())

it("retries local authentication after startup failure without opening a Convex transport", async () => {
  let available = false
  const paths: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      paths.push(path)
      if (!available) return new Response("Unavailable", { status: 503 })
      return Response.json(
        path === "/api/session"
          ? {
              token: "test-session",
              expiresAt: 1000,
              subject: "test-owner",
              convexUrl: "http://127.0.0.1:3220",
            }
          : { resources: [], scannedAt: 1000 },
      )
    }),
  )
  const registry = AtomRegistry.make()
  const unmount = registry.mount(agentLibrary)
  try {
    await vi.waitFor(() => expect(AsyncResult.isFailure(registry.get(agentLibrary))).toBe(true))
    expect(paths).toEqual(["/api/session"])
    available = true
    registry.refresh(agentLibrary)
    await vi.waitFor(() => expect(AsyncResult.isSuccess(registry.get(agentLibrary))).toBe(true))
    expect(paths).toEqual(["/api/session", "/api/session", "/api/agents"])
  } finally {
    unmount()
    registry.dispose()
  }
})
