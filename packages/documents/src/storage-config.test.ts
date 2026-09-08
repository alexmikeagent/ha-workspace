import { it } from "@effect/vitest"
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path, Result } from "effect"
import { expect } from "vite-plus/test"
import { checkStorageRoots } from "./storage-config"

const directory: FileSystem.File.Info = {
  type: "Directory",
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 1,
  ino: Option.none(),
  mode: 0o700,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: FileSystem.Size(0),
  blksize: Option.none(),
  blocks: Option.none(),
}
const storage = (working: string, canonical?: string) =>
  Layer.mergeAll(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        APP_ENV: "test",
        WORKSPACE_DATA_ROOT: "/private/workspace",
        FAKE_DRIVE_ROOT: working,
      }),
    ),
    Path.layer,
    FileSystem.layerNoop({
      realPath: (input) => Effect.succeed(input === working ? (canonical ?? input) : input),
      stat: () => Effect.succeed(directory),
    }),
  )

it.effect("accepts a separate working copy without reading file contents or writing files", () =>
  Effect.gen(function* () {
    const status = yield* checkStorageRoots().pipe(
      Effect.provide(storage("/private/workspace/fake-drive")),
    )
    expect(status).toEqual({ environment: "test", checkedDirectories: 2 })
  }),
)

it.effect.each([
  ["/private/workspace", undefined],
  ["/private/elsewhere", undefined],
  ["relative-drive", undefined],
  ["/private/workspace/fake-drive", "/home/person/GoogleDrive"],
  ["/private/workspace/GoogleDrive/copy", undefined],
] as const)("rejects an unsafe working root %s after canonicalization", ([working, canonical]) =>
  Effect.gen(function* () {
    const result = yield* checkStorageRoots().pipe(
      Effect.provide(storage(working, canonical)),
      Effect.result,
    )
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) expect(result.failure._tag).toBe("StorageConfigurationError")
  }),
)
