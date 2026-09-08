import { Table } from "@confect/core"
import { Schema } from "effect"
import { FileVersion } from "../../src/contracts"
export default Table.make(() =>
  Schema.Struct({ ...FileVersion.fields, workspaceId: Schema.String, fileId: Schema.String }),
)
  .index("by_file", ["workspaceId", "fileId"])
  .index("by_key", ["workspaceId", "id"])
