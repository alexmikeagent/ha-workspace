import { Auth, DatabaseReader, DatabaseWriter } from "@confect/server"
import { Effect } from "effect"
import { WorkspaceError, type WorkspaceFile } from "../src/contracts"
import schema from "./_generated/schema"
export const Reader = DatabaseReader.DatabaseReader<typeof schema>()
export const Writer = DatabaseWriter.DatabaseWriter<typeof schema>()
export const failure = (code: string, message: string) => new WorkspaceError({ code, message })
export const identity = (role: "owner" | "importer") =>
  Effect.gen(function* () {
    const auth = yield* Auth.Auth
    const user = yield* auth.getUserIdentity.pipe(
      Effect.catch(() =>
        Effect.fail(failure("Unauthenticated", "Open this workspace from its local application.")),
      ),
    )
    if (user.workspaceId !== "ha-workspace" || user.role !== role)
      return yield* Effect.fail(failure("Forbidden", "This session cannot perform that action."))
    return {
      workspaceId: "ha-workspace",
      subject: user.subject,
      name: typeof user.name === "string" ? user.name : "Workspace owner",
    }
  })
export const publicFile = (file: WorkspaceFile): WorkspaceFile => ({
  id: file.id,
  name: file.name,
  companyId: file.companyId,
  projectId: file.projectId,
  category: file.category,
  extension: file.extension,
  size: file.size,
  modifiedAt: file.modifiedAt,
  importedAt: file.importedAt,
  currentVersionId: file.currentVersionId,
  sourceLabel: file.sourceLabel,
})

// A stored document failing its deployed Effect schema is a code/data migration defect.
// Expected business failures stay WorkspaceError; never convert those with this helper.
export const databaseContract = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.orDie)
