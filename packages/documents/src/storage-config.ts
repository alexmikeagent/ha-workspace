import { Config, Effect, FileSystem, Path, Schema } from "effect"

export class StorageConfigurationError extends Schema.TaggedError<StorageConfigurationError>()(
  "StorageConfigurationError",
  { message: Schema.String },
) {}

export const checkStorageRoots = Effect.fn("storage.checkRoots")(function* () {
  const config = yield* Config.all({
    environment: Config.literals(["development", "test", "staging", "production"], "APP_ENV"),
    data: Config.nonEmptyString("WORKSPACE_DATA_ROOT"),
    working: Config.nonEmptyString("FAKE_DRIVE_ROOT"),
  })
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  for (const root of [config.data, config.working]) {
    if (!path.isAbsolute(root)) {
      return yield* new StorageConfigurationError({
        message: "Storage roots must be absolute paths.",
      })
    }
  }
  const resolved = yield* Effect.all({
    data: fs.realPath(config.data),
    working: fs.realPath(config.working),
  })
  const relative = path.relative(resolved.data, resolved.working)
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    [resolved.data, resolved.working].some((root) =>
      root.toLowerCase().split(/[\\/]/).includes("googledrive"),
    )
  ) {
    return yield* new StorageConfigurationError({
      message:
        "The working copy must be inside separate application storage, outside Google Drive.",
    })
  }
  for (const root of [resolved.data, resolved.working]) {
    const info = yield* fs.stat(root)
    if (info.type !== "Directory") {
      return yield* new StorageConfigurationError({
        message: "A configured storage root is not a directory.",
      })
    }
  }
  return { environment: config.environment, checkedDirectories: 2 } as const
})
