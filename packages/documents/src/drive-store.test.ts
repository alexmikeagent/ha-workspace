import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import { symlink } from "node:fs/promises"
import { ConfigProvider, Effect, FileSystem, Layer, Path } from "effect"
import { it } from "@effect/vitest"
import { expect } from "vite-plus/test"
import { DriveStore, DriveStoreLive, resolveDrivePath } from "./drive-store"

const platform = Layer.mergeAll(BunFileSystem.layer, Path.layer)
it.effect("rejects traversal, Windows absolute paths, and symlink escapes", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped()
    const inside = `${root}/drive`
    yield* fs.makeDirectory(inside)
    yield* fs.writeFileString(`${root}/outside.txt`, "private")
    yield* Effect.promise(() => symlink(`${root}/outside.txt`, `${inside}/link.txt`))
    for (const relative of [
      "../outside.txt",
      "/etc/passwd",
      "C:\\Users\\file.txt",
      "link.txt",
      "folder/../outside.txt",
      "bad\0path",
    ]) {
      const result = yield* resolveDrivePath(inside, relative).pipe(Effect.flip)
      expect(result).toMatchObject({ code: "InvalidPath" })
    }
  }).pipe(Effect.scoped, Effect.provide(platform)),
)
it.effect(
  "indexes the standalone copy, preserves path identities, and refuses changed revision bytes",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const driveRoot = `${root}/fake-drive`
      const directory = `${driveRoot}/HA inspection/Example Company/123 Main Street`
      yield* fs.makeDirectory(directory, { recursive: true })
      yield* fs.writeFileString(`${directory}/Report.txt`, "original")
      yield* fs.writeFileString(`${directory}/Same bytes.txt`, "original")
      yield* fs.makeDirectory(`${directory}/copy.ffs_tmp`)
      yield* fs.writeFileString(`${directory}/copy.ffs_tmp/Hidden.txt`, "inert")
      const config = ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          APP_ENV: "test",
          WORKSPACE_DATA_ROOT: root,
          FAKE_DRIVE_ROOT: driveRoot,
          DRIVE_COMPANY_ROOTS: JSON.stringify(["HA inspection"]),
        }),
      )
      yield* Effect.gen(function* () {
        const store = yield* DriveStore
        const first = yield* store.scan()
        expect(first.files).toHaveLength(2)
        expect(first.files[0]?.file.id).not.toBe(first.files[1]?.file.id)
        expect(first.files[0]?.file.sha256).toBe(first.files[1]?.file.sha256)
        expect(first.projects[0]?.name).toBe("123 Main Street")
        const record = first.files.find((record) => record.file.name === "Report.txt")!
        expect((yield* store.resolve(record.file.id, record.file.currentVersionId)).path).toBe(
          `${directory}/Report.txt`,
        )
        yield* fs.writeFileString(`${directory}/Report.txt`, "changed")
        const changed = yield* store
          .resolve(record.file.id, record.file.currentVersionId)
          .pipe(Effect.flip)
        expect(changed.code).toBe("SourceChanged")
        const second = yield* store.scan()
        expect(Object.keys(second.versions)).toHaveLength(3)
        const invalid = yield* store
          .resolve("different-file", record.file.currentVersionId)
          .pipe(Effect.flip)
        expect(invalid.code).toBe("NotFound")
      }).pipe(Effect.provide(DriveStoreLive.pipe(Layer.provide(Layer.mergeAll(platform, config)))))
    }).pipe(Effect.scoped, Effect.provide(platform)),
)
