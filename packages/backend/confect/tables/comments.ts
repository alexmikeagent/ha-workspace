import { Table } from "@confect/core"
import { Schema } from "effect"
import { FileComment } from "../../src/contracts"
export default Table.make(() =>
  Schema.Struct({
    ...FileComment.fields,
    workspaceId: Schema.String,
    fileId: Schema.String,
    authorId: Schema.String,
    idempotencyKey: Schema.String,
  }),
)
  .index("by_file", ["workspaceId", "fileId"])
  .index("by_request", ["workspaceId", "authorId", "idempotencyKey"])
