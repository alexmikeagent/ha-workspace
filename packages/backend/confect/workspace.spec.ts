import { FunctionSpec } from "@confect/core"
import { Schema } from "effect"

// The initial client-safe contract. No functions are deployed by this foundation.
export const status = FunctionSpec.publicQuery({
  name: "status",
  args: () => ({}),
  returns: () => Schema.Struct({ ready: Schema.Boolean }),
})
