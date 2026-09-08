import { Table } from "@confect/core"
import { Schema } from "effect"
import { ReviewJob } from "../../src/contracts"
export default Table.make(() =>
  Schema.Struct({
    ...ReviewJob.fields,
    workspaceId: Schema.String,
    ownerId: Schema.String,
    requestId: Schema.String,
    find: Schema.String,
    replacement: Schema.String,
    fence: Schema.Number,
    leaseExpiresAt: Schema.Number,
    workerId: Schema.NullOr(Schema.String),
  }),
)
  .index("by_key", ["workspaceId", "id"])
  .index("by_file", ["workspaceId", "fileId"])
  .index("by_request", ["workspaceId", "ownerId", "requestId"])
  .index("by_status", ["workspaceId", "status"])
