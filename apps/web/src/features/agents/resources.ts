import { AgentLibrary, AgentResourceDetail, type AgentResource } from "@ha/domain/agent-library"
import { Effect, Layer, Schema } from "effect"
import { Atom } from "effect/unstable/reactivity"
import { readSession, requestJson, WorkspaceClientError } from "../workspace/browser-services"

// Local source browsing needs the owner session, but no Convex transport.
// Authenticate inside each request so a failed startup can recover on Refresh.
const agentRuntime = Atom.runtime(Layer.empty)
const requestAgentJson = Effect.fn("agents.requestJson")(function* (path: string) {
  yield* readSession
  return yield* requestJson(path)
})

const invalidResponse = () =>
  new WorkspaceClientError({
    message: "The resource library returned an unreadable response. Refresh to try again.",
  })

export const agentLibrary = agentRuntime.atom(
  requestAgentJson("/api/agents").pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(AgentLibrary)(value).pipe(Effect.mapError(invalidResponse)),
    ),
  ),
)
export const agentResource = Atom.family((id: string) =>
  agentRuntime.atom(
    requestAgentJson(`/api/agents/${encodeURIComponent(id)}`).pipe(
      Effect.flatMap((value) =>
        Schema.decodeUnknownEffect(AgentResourceDetail)(value).pipe(
          Effect.mapError(invalidResponse),
        ),
      ),
    ),
  ),
)

export const resourceFilter = Atom.make<"all" | AgentResource["kind"]>("all")
export const resourceSearch = Atom.make("")

export const resourceKinds = {
  skill: "Skill",
  instruction: "Guidance",
  reference: "Reference",
  tool: "Tool",
  configuration: "Configuration",
} as const

export function filterResources(
  resources: readonly AgentResource[],
  kind: "all" | AgentResource["kind"],
  query: string,
) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return resources.filter((resource) => {
    if (kind !== "all" && resource.kind !== kind) return false
    const text =
      `${resource.name} ${resource.description ?? ""} ${resource.relativePath}`.toLocaleLowerCase()
    return words.every((word) => text.includes(word))
  })
}
