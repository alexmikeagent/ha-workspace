import { createHash } from "node:crypto"
import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"
import type { PlatformError } from "effect/PlatformError"
import type { AgentLibrary, AgentResource, AgentResourceDetail } from "@ha/domain/agent-library"
import { isOperationalSyncPath } from "@ha/domain/catalog"
import { DriveStore, resolveDrivePath } from "./drive-store"

export class AgentLibraryError extends Schema.TaggedError<AgentLibraryError>()(
  "AgentLibraryError",
  {
    code: Schema.Literals(["NotFound", "InvalidResource", "Changed", "TooLarge", "Unavailable"]),
    message: Schema.String,
  },
) {}

export class AgentLibraryStore extends Context.Service<
  AgentLibraryStore,
  {
    readonly list: () => Effect.Effect<AgentLibrary, AgentLibraryError>
    readonly get: (id: string) => Effect.Effect<AgentResourceDetail, AgentLibraryError>
  }
>()("ha/agents/AgentLibraryStore") {}

const COLLECTION = "HA_Consulting_Work"
const MAX_RESOURCES = 128
const MAX_DIRECTORY_ENTRIES = 256
const MAX_SCANNED_ENTRIES = 512
const MAX_DEPTH = 6
export const AGENT_PREVIEW_BYTES = 256 * 1024
const extensions = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".py",
  ".sh",
  ".html",
  ".css",
  ".js",
  ".ts",
])
const scriptExtensions = new Set([".py", ".sh", ".js", ".ts"])
const configurationExtensions = new Set([".json", ".yaml", ".yml"])
const excludedName =
  /(^|[._-])(secrets?|credentials?|passwords?|tokens?|private|api[_-]?keys?|access[_-]?keys?|auth[_-]?keys?|id_rsa|id_ed25519)([._-]|$)/i
const resourceId = (relative: string) =>
  createHash("sha256").update(`agent-resource:${relative}`).digest("hex")
const unavailable = () =>
  new AgentLibraryError({
    code: "Unavailable",
    message: "The copied agent library could not be read.",
  })
const tooLarge = () =>
  new AgentLibraryError({
    code: "TooLarge",
    message: "The copied agent library exceeds the browsing limit.",
  })
const missing = () =>
  new AgentLibraryError({
    code: "NotFound",
    message: "This agent resource was not found in the working copy.",
  })

interface Candidate {
  readonly relativePath: string
  readonly kind: AgentResource["kind"]
  readonly skillId: string | null
}

function allowedName(name: string) {
  return (
    !name.startsWith(".") &&
    !name.startsWith("~$") &&
    !name.includes("\\") &&
    !name.includes("/") &&
    !excludedName.test(name) &&
    !isOperationalSyncPath(name)
  )
}

function frontmatterDescription(content: string) {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return undefined
  const end = content.indexOf("\n---", 4)
  if (end < 0 || end > 8192) return undefined
  const description = /^description:[ \t]*(.+)$/m.exec(content.slice(0, end))?.[1]?.trim()
  if (!description || description === "|" || description === ">") return undefined
  return description.replace(/^(["'])(.*)\1$/, "$2").slice(0, 700)
}

export const AgentLibraryStoreLive = Layer.effect(
  AgentLibraryStore,
  Effect.gen(function* () {
    const drive = yield* DriveStore
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    // Only approved relative paths enter this helper. Every directory and file is
    // checked again before use; the ordinary document catalog never grants access.
    const locate = Effect.fn("agents.locate")(function* (relative: string) {
      if (!(yield* fs.exists(path.join(drive.driveRoot, relative)))) return null
      return yield* resolveDrivePath(drive.driveRoot, relative).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.catchTag("DriveError", (error) =>
          error.code === "InvalidPath" ? Effect.succeed(null) : Effect.fail(unavailable()),
        ),
      )
    })

    const directoryEntries = Effect.fn("agents.directoryEntries")(function* (relative: string) {
      const full = yield* locate(relative)
      if (!full || (yield* fs.stat(full)).type !== "Directory") return []
      const names = yield* fs.readDirectory(full)
      if (names.length > MAX_DIRECTORY_ENTRIES) return yield* tooLarge()
      return names.filter(allowedName).sort()
    })

    const discover = Effect.fn("agents.discover")(function* () {
      const candidates: Candidate[] = []
      let scannedEntries = 0
      const entries = Effect.fn("agents.boundedDirectory")(function* (relative: string) {
        const names = yield* directoryEntries(relative)
        scannedEntries += names.length
        if (scannedEntries > MAX_SCANNED_ENTRIES) return yield* tooLarge()
        return names
      })
      const add = Effect.fn("agents.addCandidate")(function* (candidate: Candidate) {
        const full = yield* locate(candidate.relativePath)
        if (!full || (yield* fs.stat(full)).type !== "File") return
        if (candidates.length >= MAX_RESOURCES) return yield* tooLarge()
        candidates.push(candidate)
      })
      for (const [relative, kind] of [
        ["AGENTS.md", "instruction"],
        ["HA_DFR_AGENT_HANDOFF.md", "instruction"],
        ["README - Folder Guide.md", "reference"],
        ["02 - Templates and Reference/README.md", "reference"],
        ["Reports/README.md", "reference"],
        ["template-manifest.json", "configuration"],
      ] as const) {
        yield* add({ relativePath: `${COLLECTION}/${relative}`, kind, skillId: null })
      }
      const walk = (
        relative: string,
        skillId: string | null,
        depth: number,
      ): Effect.Effect<void, AgentLibraryError | PlatformError> =>
        Effect.gen(function* () {
          if (depth > MAX_DEPTH) return yield* tooLarge()
          for (const name of yield* entries(relative)) {
            const child = `${relative}/${name}`
            const full = yield* locate(child)
            if (!full) continue
            const info = yield* fs.stat(full)
            if (info.type === "Directory") {
              yield* walk(child, skillId, depth + 1)
            } else if (info.type === "File") {
              const extension = path.extname(name).toLowerCase()
              if (!extensions.has(extension)) continue
              yield* add({
                relativePath: child,
                skillId,
                kind: scriptExtensions.has(extension)
                  ? "tool"
                  : configurationExtensions.has(extension)
                    ? "configuration"
                    : "reference",
              })
            }
          }
        })

      yield* walk(`${COLLECTION}/tools`, null, 0)
      const skills = `${COLLECTION}/.agents/skills`
      for (const name of yield* entries(skills)) {
        const skillRoot = `${skills}/${name}`
        const entry = `${skillRoot}/SKILL.md`
        const full = yield* locate(entry)
        if (!full || (yield* fs.stat(full)).type !== "File") continue
        const skillId = resourceId(entry)
        yield* add({ relativePath: entry, kind: "skill", skillId })
        yield* add({
          relativePath: `${skillRoot}/agents/openai.yaml`,
          kind: "configuration",
          skillId,
        })
        for (const folder of ["references", "scripts", "assets"]) {
          yield* walk(`${skillRoot}/${folder}`, skillId, 0)
        }
      }
      return candidates.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    })

    const read = Effect.fn("agents.read")(function* (candidate: Candidate) {
      const full = yield* locate(candidate.relativePath)
      if (!full) return yield* missing()
      const file = yield* fs.open(full, { flag: "r" })
      const before = yield* file.stat
      if (before.type !== "File")
        return yield* new AgentLibraryError({
          code: "InvalidResource",
          message: "This agent resource is not a text file.",
        })
      const buffer = new Uint8Array(Math.min(Number(before.size), AGENT_PREVIEW_BYTES))
      let count = 0
      while (count < buffer.byteLength) {
        const readCount = Number(yield* file.read(buffer.subarray(count)))
        if (readCount === 0) break
        count += readCount
      }
      const after = yield* file.stat
      const modifiedAt = Option.getOrUndefined(before.mtime)?.getTime() ?? 0
      if (
        before.size !== after.size ||
        modifiedAt !== (Option.getOrUndefined(after.mtime)?.getTime() ?? 0)
      ) {
        return yield* new AgentLibraryError({
          code: "Changed",
          message: "This copied resource changed while being read. Refresh the library.",
        })
      }
      const truncated = BigInt(count) < before.size
      const content = yield* Effect.try({
        // Streaming decode omits an incomplete final code point at a truncated
        // boundary, while still rejecting invalid UTF-8 inside the visible text.
        try: () =>
          new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, count), {
            stream: truncated,
          }),
        catch: () =>
          new AgentLibraryError({
            code: "InvalidResource",
            message: "This agent resource is not valid UTF-8 text.",
          }),
      })
      if (content.includes("\0"))
        return yield* new AgentLibraryError({
          code: "InvalidResource",
          message: "Binary agent resources cannot be displayed as text.",
        })
      const heading =
        path.extname(full).toLowerCase() === ".md"
          ? /^#\s+(.+)$/m.exec(content)?.[1]?.trim()
          : undefined
      const description = candidate.kind === "skill" ? frontmatterDescription(content) : undefined
      const resource: AgentResource = {
        id: resourceId(candidate.relativePath),
        name: (heading || path.basename(candidate.relativePath)).slice(0, 180),
        kind: candidate.kind,
        relativePath: candidate.relativePath,
        skillId: candidate.skillId,
        ...(description ? { description } : {}),
        sizeBytes: Number(before.size),
        modifiedAt,
      }
      return { resource, content, truncated }
    }, Effect.scoped)

    const mapFailure = (error: unknown) =>
      error instanceof AgentLibraryError ? error : unavailable()
    const scan = Effect.fn("agents.scan")(function* () {
      const candidates = yield* discover()
      return yield* Effect.forEach(
        candidates,
        (candidate) =>
          read(candidate).pipe(
            Effect.catchTag("AgentLibraryError", (error) =>
              error.code === "InvalidResource" || error.code === "NotFound"
                ? Effect.succeed(null)
                : Effect.fail(error),
            ),
          ),
        { concurrency: 4 },
      ).pipe(Effect.map((items) => items.filter((item) => item !== null)))
    })

    return AgentLibraryStore.of({
      list: () =>
        Effect.gen(function* () {
          const entries = yield* scan()
          return {
            resources: entries.map((entry) => entry.resource),
            scannedAt: yield* Effect.clockWith((clock) =>
              Effect.succeed(clock.currentTimeMillisUnsafe()),
            ),
          }
        }).pipe(Effect.mapError(mapFailure)),
      get: (id) =>
        Effect.gen(function* () {
          if (!/^[a-f0-9]{64}$/.test(id)) return yield* missing()
          const candidates = yield* discover()
          const selected = candidates.find((candidate) => resourceId(candidate.relativePath) === id)
          if (!selected) return yield* missing()
          const detail = yield* read(selected)
          const related = selected.skillId
            ? candidates.filter(
                (candidate) =>
                  candidate.skillId === selected.skillId &&
                  resourceId(candidate.relativePath) !== id,
              )
            : []
          const supportingResources = yield* Effect.forEach(
            related,
            (candidate) =>
              read(candidate).pipe(
                Effect.map((entry) => entry.resource),
                Effect.catchTag("AgentLibraryError", (error) =>
                  error.code === "InvalidResource" || error.code === "NotFound"
                    ? Effect.succeed(null)
                    : Effect.fail(error),
                ),
              ),
            { concurrency: 4 },
          ).pipe(Effect.map((items) => items.filter((item) => item !== null)))
          return { ...detail, supportingResources }
        }).pipe(Effect.mapError(mapFailure)),
    })
  }),
)
