import { createHash } from "node:crypto"
import { symlink } from "node:fs/promises"
import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import { it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { expect } from "vite-plus/test"
import { AgentLibraryStore, AgentLibraryStoreLive, AGENT_PREVIEW_BYTES } from "./agent-library"
import { DriveStore } from "./drive-store"

const platform = Layer.mergeAll(BunFileSystem.layer, Path.layer)
const prefix = "HA_Consulting_Work"
const idFor = (relative: string) =>
  createHash("sha256").update(`agent-resource:${relative}`).digest("hex")
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* fs.makeTempDirectoryScoped()
  const driveRoot = `${root}/fake-drive`
  yield* fs.makeDirectory(driveRoot)
  const put = (relative: string, content: string | Uint8Array) =>
    Effect.gen(function* () {
      const full = `${driveRoot}/${relative}`
      yield* fs.makeDirectory(path.dirname(full), { recursive: true })
      yield* fs.writeFile(
        full,
        typeof content === "string" ? new TextEncoder().encode(content) : content,
      )
    })
  const layer = AgentLibraryStoreLive.pipe(
    Layer.provide(
      Layer.succeed(DriveStore, {
        driveRoot,
        dataRoot: root,
        scan: () => Effect.die("The agent library must not import documents."),
        index: () => Effect.die("The agent library must not use the document catalog."),
        recordRevision: () => Effect.die("The agent library must never write a revision."),
        resolve: () => Effect.die("Agent resource IDs are separate from document IDs."),
      }),
    ),
  )
  return { fs, root, driveRoot, put, layer }
})

it.effect("discovers only approved skill resources and sees new skills on refresh", () =>
  Effect.gen(function* () {
    const test = yield* fixture
    const skill = `${prefix}/.agents/skills/example`
    yield* test.put(`${prefix}/AGENTS.md`, "# Workspace rules\nKeep source copies intact.")
    yield* test.put(
      `${skill}/SKILL.md`,
      "---\nname: example\ndescription: Read the supplied context.\n---\n# Example Skill\nInstructions are text.",
    )
    yield* test.put(`${skill}/references/facts.md`, "# Facts\nVerified reference text.")
    yield* test.put(`${skill}/agents/openai.yaml`, 'interface:\n  display_name: "Example"')
    yield* test.put(
      `${skill}/assets/template.html`,
      '<script>throw new Error("must not execute")</script>',
    )
    yield* test.put(`${skill}/scripts/helper.py`, 'raise RuntimeError("must not execute")')
    for (const relative of [
      `${skill}/extra.md`,
      `${skill}/references/.env`,
      `${skill}/references/secrets.md`,
      `${skill}/references/access-token.json`,
      `${skill}/references/api-key.json`,
      `${skill}/references/.codex-task/result.md`,
      `${skill}/references/sync.ffs_lock`,
      `${skill}/references/photo.png`,
      `${prefix}/.codex-another-task/AGENTS.md`,
      `${prefix}/Clients/private.md`,
    ])
      yield* test.put(relative, "Excluded data")
    yield* Effect.gen(function* () {
      const store = yield* AgentLibraryStore
      const first = yield* store.list()
      expect(first.resources).toHaveLength(6)
      expect(JSON.stringify(first)).not.toContain(test.root)
      expect(first.resources.every((item) => /^[a-f0-9]{64}$/.test(item.id))).toBe(true)
      const entry = first.resources.find((item) => item.kind === "skill")
      expect(entry).toMatchObject({
        name: "Example Skill",
        description: "Read the supplied context.",
      })
      const detail = yield* store.get(idFor(`${skill}/SKILL.md`))
      expect(detail.supportingResources).toHaveLength(4)
      expect(detail.supportingResources.every((item) => item.skillId === entry?.id)).toBe(true)
      expect(detail.content).toContain("Instructions are text.")
      const html = yield* store.get(idFor(`${skill}/assets/template.html`))
      expect(html.content).toContain("<script>")
      const forbidden = yield* store.get(idFor(`${prefix}/Clients/private.md`)).pipe(Effect.flip)
      expect(forbidden.code).toBe("NotFound")
      yield* test.put(`${prefix}/.agents/skills/new-skill/SKILL.md`, "# Newly copied skill")
      const refreshed = yield* store.list()
      expect(refreshed.resources.filter((item) => item.kind === "skill")).toHaveLength(2)
      expect(first.resources).toHaveLength(6)
    }).pipe(Effect.provide(test.layer))
  }).pipe(Effect.scoped, Effect.provide(platform)),
)

it.effect("rejects direct and ancestor symlinks and never accepts client paths", () =>
  Effect.gen(function* () {
    const test = yield* fixture
    const skill = `${prefix}/.agents/skills/example`
    yield* test.put(`${skill}/SKILL.md`, "# Safe skill")
    yield* test.fs.makeDirectory(`${test.driveRoot}/${skill}/references`)
    yield* test.fs.makeDirectory(`${test.root}/outside`)
    yield* test.fs.writeFileString(`${test.root}/outside/SKILL.md`, "Outside secret")
    for (const [source, target] of [
      [`${test.root}/outside/SKILL.md`, `${test.driveRoot}/${prefix}/AGENTS.md`],
      [`${test.root}/outside/SKILL.md`, `${test.driveRoot}/${skill}/references/link.md`],
      [`${test.root}/outside`, `${test.driveRoot}/${prefix}/.agents/skills/linked`],
    ] as const)
      yield* Effect.promise(() => symlink(source, target))
    yield* Effect.gen(function* () {
      const store = yield* AgentLibraryStore
      expect((yield* store.list()).resources.map((item) => item.relativePath)).toEqual([
        `${skill}/SKILL.md`,
      ])
      for (const id of [
        "../outside/SKILL.md",
        "/etc/passwd",
        "C:\\Users\\secret",
        idFor(`${skill}/references/link.md`),
        idFor(`${prefix}/.agents/skills/linked/SKILL.md`),
      ]) {
        const error = yield* store.get(id).pipe(Effect.flip)
        expect(error.code).toBe("NotFound")
        expect(error.message).not.toContain(test.root)
      }
    }).pipe(Effect.provide(test.layer))
  }).pipe(Effect.scoped, Effect.provide(platform)),
)

it.effect("bounds text reads, handles a partial UTF-8 code point, and rejects binary text", () =>
  Effect.gen(function* () {
    const test = yield* fixture
    const skill = `${prefix}/.agents/skills/example`
    yield* test.put(`${skill}/SKILL.md`, "# Example")
    yield* test.put(`${skill}/references/long.md`, `${"a".repeat(AGENT_PREVIEW_BYTES - 1)}€ tail`)
    yield* test.put(`${skill}/references/invalid.md`, new Uint8Array([0xff, 0xfe]))
    yield* test.put(`${skill}/references/binary.md`, new Uint8Array([65, 0, 66]))
    yield* Effect.gen(function* () {
      const store = yield* AgentLibraryStore
      const detail = yield* store.get(idFor(`${skill}/references/long.md`))
      expect(detail.truncated).toBe(true)
      expect(detail.content.length).toBe(AGENT_PREVIEW_BYTES - 1)
      expect(detail.content).not.toContain("�")
      expect(detail.resource.sizeBytes).toBeGreaterThan(AGENT_PREVIEW_BYTES)
      expect((yield* store.list()).resources).toHaveLength(2)
      for (const name of ["invalid.md", "binary.md"]) {
        expect(
          (yield* store.get(idFor(`${skill}/references/${name}`)).pipe(Effect.flip)).code,
        ).toBe("InvalidResource")
      }
    }).pipe(Effect.provide(test.layer))
  }).pipe(Effect.scoped, Effect.provide(platform)),
)

it.effect(
  "rejects an overlarge discovered library instead of crawling unbounded support trees",
  () =>
    Effect.gen(function* () {
      const test = yield* fixture
      const skill = `${prefix}/.agents/skills/example`
      yield* test.put(`${skill}/SKILL.md`, "# Example")
      yield* Effect.forEach(
        Array.from({ length: 128 }, (_, i) => i),
        (i) => test.put(`${skill}/references/item-${i}.md`, "Reference"),
        { concurrency: 8 },
      )
      yield* Effect.gen(function* () {
        const store = yield* AgentLibraryStore
        expect((yield* store.list().pipe(Effect.flip)).code).toBe("TooLarge")
      }).pipe(Effect.provide(test.layer))
    }).pipe(Effect.scoped, Effect.provide(platform)),
)

it.effect("bounds empty directory fan-out as well as the resource count", () =>
  Effect.gen(function* () {
    const test = yield* fixture
    const skill = `${prefix}/.agents/skills/example`
    yield* test.put(`${skill}/SKILL.md`, "# Example")
    yield* Effect.forEach(
      Array.from({ length: 540 }, (_, i) => i),
      (i) =>
        test.fs.makeDirectory(
          `${test.driveRoot}/${skill}/references/branch-${Math.floor(i / 180)}/leaf-${i}`,
          { recursive: true },
        ),
      { concurrency: 8 },
    )
    yield* Effect.gen(function* () {
      const store = yield* AgentLibraryStore
      expect((yield* store.list().pipe(Effect.flip)).code).toBe("TooLarge")
    }).pipe(Effect.provide(test.layer))
  }).pipe(Effect.scoped, Effect.provide(platform)),
)
