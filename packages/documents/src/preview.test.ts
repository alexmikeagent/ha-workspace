import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import { ConfigProvider, Effect, Fiber, FileSystem, Layer, Path, Queue } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"
import { it } from "@effect/vitest"
import { expect } from "vite-plus/test"
import { DriveStore, DriveStoreLive } from "./drive-store"
import { PreviewStore, PreviewStoreLive } from "./preview"

const platform = Layer.mergeAll(BunFileSystem.layer, Path.layer)
it.effect(
  "cancelling a render releases its process scope, temporary files, and render permit",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const driveRoot = `${root}/fake-drive`
      yield* fs.makeDirectory(driveRoot)
      yield* fs.writeFileString(`${driveRoot}/Example.docx`, "controlled renderer fixture")
      const started = yield* Queue.unbounded<string>()
      let interrupted = 0
      const base = ChildProcessSpawner.make(() =>
        Effect.die("Unexpected spawn in controlled renderer test"),
      )
      const spawner = Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, {
        ...base,
        exitCode: (command) =>
          command._tag === "StandardCommand" && command.args.includes("verify")
            ? Effect.succeed(ChildProcessSpawner.ExitCode(0))
            : Queue.offer(started, "render").pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() =>
                  Effect.sync(() => {
                    interrupted++
                  }),
                ),
              ),
      })
      const config = ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          APP_ENV: "test",
          WORKSPACE_DATA_ROOT: root,
          FAKE_DRIVE_ROOT: driveRoot,
          DRIVE_COMPANY_ROOTS: "[]",
          PYTHON_BIN: "controlled-python",
          LIBREOFFICE_BIN: "controlled-office",
        }),
      )
      const dependencies = Layer.mergeAll(platform, config, spawner)
      const drive = DriveStoreLive.pipe(Layer.provide(dependencies))
      const services = Layer.mergeAll(
        drive,
        PreviewStoreLive.pipe(Layer.provide(Layer.mergeAll(drive, dependencies))),
      )
      yield* Effect.gen(function* () {
        const store = yield* DriveStore
        const preview = yield* PreviewStore
        const record = (yield* store.scan()).files[0]!
        for (let attempt = 0; attempt < 2; attempt++) {
          const fiber = yield* preview
            .content(record.file.id, record.file.currentVersionId)
            .pipe(Effect.forkScoped)
          yield* Queue.take(started)
          expect(
            (yield* fs.readDirectory(`${root}/previews`)).some((name) =>
              name.startsWith("render-"),
            ),
          ).toBe(true)
          yield* Fiber.interrupt(fiber)
          expect(
            (yield* fs.readDirectory(`${root}/previews`)).some((name) =>
              name.startsWith("render-"),
            ),
          ).toBe(false)
        }
        expect(interrupted).toBe(2)
        expect(yield* fs.readFileString(`${driveRoot}/Example.docx`)).toBe(
          "controlled renderer fixture",
        )
      }).pipe(Effect.provide(services))
    }).pipe(Effect.scoped, Effect.provide(platform)),
)
