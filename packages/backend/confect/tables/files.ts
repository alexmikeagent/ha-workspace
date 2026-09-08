import { Table } from "@confect/core"
import { Schema } from "effect"
import { WorkspaceFile } from "../../src/contracts"
export default Table.make(() =>
  Schema.Struct({ ...WorkspaceFile.fields, workspaceId: Schema.String }),
)
  .index("by_workspace", ["workspaceId"])
  .index("by_key", ["workspaceId", "id"])
