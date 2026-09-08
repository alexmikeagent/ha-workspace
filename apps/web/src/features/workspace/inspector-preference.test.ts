import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { AtomRegistry } from "effect/unstable/reactivity"
import { inspectorWidthAtom } from "./state"
import {
  boundedInspectorWidth,
  inspectorKeyboardWidth,
  inspectorWidthLimit,
} from "./resizable-inspector"

const registries: AtomRegistry.AtomRegistry[] = []
const key = "ha-workspace.ui.inspector-width.v1"

function storageWith(value?: string) {
  const entries = new Map<string, string>(value === undefined ? [] : [[key, value]])
  vi.stubGlobal("localStorage", {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, next: string) => entries.set(name, next),
    removeItem: (name: string) => entries.delete(name),
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size
    },
  })
  return entries
}

function mountPreference() {
  const registry = AtomRegistry.make()
  registries.push(registry)
  registry.mount(inspectorWidthAtom)
  return registry
}

afterEach(() => {
  for (const registry of registries.splice(0)) registry.dispose()
  vi.unstubAllGlobals()
})

describe("inspector width preference", () => {
  it("persists a completed resize across independent workspace registries", async () => {
    const entries = storageWith("330")
    const first = mountPreference()
    await vi.waitFor(() => expect(first.get(inspectorWidthAtom)).toBe(330))
    first.set(inspectorWidthAtom, 448)
    await vi.waitFor(() => expect(entries.get(key)).toBe("448"))
    first.dispose()
    const reopened = mountPreference()
    await vi.waitFor(() => expect(reopened.get(inspectorWidthAtom)).toBe(448))
  })

  it.each(["9000", "-1", '"not a number"'])(
    "ignores an invalid stored width (%s) and accepts a later valid preference",
    async (invalid) => {
      const entries = storageWith(invalid)
      const registry = mountPreference()
      expect(registry.get(inspectorWidthAtom)).toBe(330)
      registry.set(inspectorWidthAtom, 400)
      await vi.waitFor(() => expect(entries.get(key)).toBe("400"))
    },
  )

  it("temporarily narrows the inspector without discarding the saved wide-screen preference", async () => {
    const entries = storageWith("560")
    const registry = mountPreference()
    await vi.waitFor(() => expect(registry.get(inspectorWidthAtom)).toBe(560))
    const narrow = boundedInspectorWidth(registry.get(inspectorWidthAtom), inspectorWidthLimit(740))
    expect(narrow).toBe(380)
    expect(740 - narrow).toBe(360)
    expect(entries.get(key)).toBe("560")
    expect(boundedInspectorWidth(registry.get(inspectorWidthAtom), inspectorWidthLimit(1200))).toBe(
      560,
    )
  })

  it("keeps right-anchored keyboard resizing bounded and leaves unrelated keys alone", () => {
    expect(inspectorKeyboardWidth("ArrowLeft", 390, 400)).toBe(400)
    expect(inspectorKeyboardWidth("ArrowRight", 290, 400)).toBe(280)
    expect(inspectorKeyboardWidth("ArrowLeft", 330, 560, true)).toBe(362)
    expect(inspectorKeyboardWidth("Home", 380, 400)).toBe(280)
    expect(inspectorKeyboardWidth("End", 380, 400)).toBe(400)
    expect(inspectorKeyboardWidth("Tab", 380, 400)).toBeUndefined()
  })
})
