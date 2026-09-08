import { Schema } from "effect"

export const AgentResourceKind = Schema.Literals([
  "skill",
  "instruction",
  "reference",
  "tool",
  "configuration",
])
export const AgentResource = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: AgentResourceKind,
  relativePath: Schema.String,
  description: Schema.optionalKey(Schema.String),
  skillId: Schema.NullOr(Schema.String),
  sizeBytes: Schema.Number,
  modifiedAt: Schema.Number,
})
export type AgentResource = typeof AgentResource.Type

export const AgentLibrary = Schema.Struct({
  resources: Schema.Array(AgentResource),
  scannedAt: Schema.Number,
})
export type AgentLibrary = typeof AgentLibrary.Type

export const AgentResourceDetail = Schema.Struct({
  resource: AgentResource,
  content: Schema.String,
  truncated: Schema.Boolean,
  supportingResources: Schema.Array(AgentResource),
})
export type AgentResourceDetail = typeof AgentResourceDetail.Type
