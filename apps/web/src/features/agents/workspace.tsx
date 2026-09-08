import { Link } from "@tanstack/react-router"
import { useAtom, useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/unstable/reactivity"
import type { AgentResource } from "@ha/domain/agent-library"
import { Button } from "@workspace/ui/components/button"
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  FolderClosed,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "@workspace/ui/components/icons"
import { errorOf, LoadingRows, Notice, valueOf } from "../workspace/document"
import { formatDate, formatSize, inspectorOpenAtom, type WorkspaceSearch } from "../workspace/state"
import { ResizableInspector } from "../workspace/resizable-inspector"
import {
  agentLibrary,
  agentResource,
  filterResources,
  resourceFilter,
  resourceKinds,
  resourceSearch,
} from "./resources"
import { AgentResourceViewer } from "./resource-viewer"
import "./workspace.css"

const filters = [
  ["all", "All resources"],
  ["skill", "Skills"],
  ["instruction", "Guidance"],
  ["tool", "Tools"],
  ["reference", "References"],
  ["configuration", "Configuration"],
] as const

export function AgentsWorkspace({ search }: { readonly search: WorkspaceSearch }) {
  const state = useAtomValue(agentLibrary)
  const refresh = useAtomRefresh(agentLibrary)
  const [kind, setKind] = useAtom(resourceFilter)
  const [query, setQuery] = useAtom(resourceSearch)
  const [inspectorOpen, setInspectorOpen] = useAtom(inspectorOpenAtom)
  const library = valueOf(state)
  const resources = library?.resources ?? []
  const filtered = filterResources(resources, kind, query)
  const skills = filtered.filter((resource) => resource.kind === "skill")
  const other = filtered.filter((resource) => resource.kind !== "skill")

  if (search.resource) return <ResourceWorkspace id={search.resource} resources={resources} />

  return (
    <div className="workspace-columns agents-columns">
      <main id="workspace-main" className="workspace-main agents-main">
        <div className="agents-page-heading">
          <div>
            <h1>Agents</h1>
            <p>Skills, project instructions, and the files behind them.</p>
          </div>
          <Button
            variant="outline"
            onClick={refresh}
            disabled={state.waiting}
            aria-label="Refresh agent resources"
          >
            <RefreshCw className={state.waiting ? "animate-spin" : undefined} />
            <span>Refresh</span>
          </Button>
        </div>
        <div className="agents-library-note">
          <Sparkles />
          <span>Your project’s reference library</span>
          <span className="agents-count">
            {library ? `${resources.length} resources` : "Loading…"}
          </span>
        </div>
        <div className="agents-search">
          <Search />
          <input
            type="search"
            aria-label="Search agent resources"
            placeholder="Search skills, instructions, and tools…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <fieldset className="agents-filters" aria-label="Filter agent resources">
          {filters.map(([value, label]) => (
            <Button
              key={value}
              variant="ghost"
              size="sm"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {label}
            </Button>
          ))}
        </fieldset>
        {AsyncResult.isFailure(state) && (
          <Notice title="Could not load the resource library" retry={refresh}>
            {errorOf(state)}
          </Notice>
        )}
        {!library && !AsyncResult.isFailure(state) && <LoadingRows />}
        {library && filtered.length === 0 && (
          <Notice title={query ? "No matching resources" : "No resources in this view"}>
            {query
              ? "Try a skill name, file name, or part of its folder path."
              : "Choose another category or refresh after adding project resources to the working copy."}
          </Notice>
        )}
        {skills.length > 0 && (
          <section className="agents-skills" aria-labelledby="agent-skills-heading">
            <div className="list-heading">
              <h2 id="agent-skills-heading">Project skills</h2>
              <span>{skills.length} skills</span>
            </div>
            <div className="agent-skill-grid">
              {skills.map((skill) => (
                <Link
                  key={skill.id}
                  to="/"
                  search={{ section: "agents", resource: skill.id }}
                  className="agent-skill-card"
                >
                  <div className="agent-skill-top">
                    <span className="agent-skill-icon">
                      <Sparkles size={19} />
                    </span>
                    <ArrowRight size={17} />
                  </div>
                  <h3>{skill.name}</h3>
                  <p>
                    {skill.description ||
                      "Read the project instructions and supporting resources for this skill."}
                  </p>
                  <div className="agent-skill-footer">
                    <span>
                      {
                        resources.filter(
                          (resource) => resource.skillId === skill.id && resource.id !== skill.id,
                        ).length
                      }{" "}
                      supporting files
                    </span>
                    <span>View skill</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
        {other.length > 0 && (
          <section aria-labelledby="agent-resources-heading">
            <div className="list-heading">
              <h2 id="agent-resources-heading">
                {kind === "all"
                  ? "Guidance & supporting files"
                  : filters.find(([value]) => value === kind)?.[1]}
              </h2>
              <span>{other.length} files</span>
            </div>
            <div className="agents-resource-list">
              {other.map((resource) => (
                <ResourceRow resource={resource} key={resource.id} />
              ))}
            </div>
          </section>
        )}
      </main>
      {inspectorOpen && (
        <ResizableInspector className="agents-inspector" label="Agent library context">
          <div className="inspector-heading">
            <span>Agent library</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close inspector"
              onClick={() => setInspectorOpen(false)}
            >
              <X />
            </Button>
          </div>
          <div className="agents-inspector-body">
            <span className="agents-context-icon">
              <FolderClosed size={23} />
            </span>
            <h2>The knowledge behind the work</h2>
            <p>
              Explore the guidance retained with this project, from report skills to the tools they
              reference.
            </p>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>Local Drive copy</dd>
              </div>
              <div>
                <dt>Skills</dt>
                <dd>
                  {library ? resources.filter((resource) => resource.kind === "skill").length : "—"}
                </dd>
              </div>
              <div>
                <dt>Resources</dt>
                <dd>{library ? resources.length : "—"}</dd>
              </div>
              <div>
                <dt>Last scan</dt>
                <dd>{library ? formatDate(library.scannedAt) : "—"}</dd>
              </div>
            </dl>
            <div className="agents-use-note">
              <ShieldCheck />
              <p>
                These resources are available to review. Opening one does not enable it or change
                the assistant’s instructions.
              </p>
            </div>
            <p className="agents-secondary-note">
              The document revision worker uses its built-in rules. Drive skills are not loaded into
              that worker automatically.
            </p>
          </div>
        </ResizableInspector>
      )}
    </div>
  )
}

function ResourceRow({ resource }: { readonly resource: AgentResource }) {
  return (
    <Link
      to="/"
      search={{ section: "agents", resource: resource.id }}
      className="agent-resource-row"
    >
      <FileText size={19} />
      <div>
        <strong>{resource.name}</strong>
        <span>{resource.relativePath}</span>
      </div>
      <span className="agent-kind-label">{resourceKinds[resource.kind]}</span>
      <ArrowRight size={15} />
    </Link>
  )
}

function ResourceWorkspace({
  id,
  resources,
}: {
  readonly id: string
  readonly resources: readonly AgentResource[]
}) {
  const state = useAtomValue(agentResource(id))
  const refresh = useAtomRefresh(agentResource(id))
  const detail = valueOf(state)
  const [inspectorOpen, setInspectorOpen] = useAtom(inspectorOpenAtom)
  return (
    <div className="workspace-columns agents-columns">
      <main id="workspace-main" className="agents-resource-main">
        <div className="agents-resource-heading">
          <Link to="/" search={{ section: "agents" }} className="back-link">
            <ArrowLeft size={15} />
            Back to Agents
          </Link>
          <div className="agents-resource-title">
            <div>
              <h1>{detail?.resource.name ?? "Agent resource"}</h1>
              {detail && <p>{detail.resource.description || detail.resource.relativePath}</p>}
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh this resource"
              onClick={refresh}
              disabled={state.waiting}
            >
              <RefreshCw className={state.waiting ? "animate-spin" : undefined} />
            </Button>
          </div>
        </div>
        {AsyncResult.isFailure(state) && (
          <Notice title="Could not open this resource" retry={refresh}>
            {errorOf(state)}
          </Notice>
        )}
        {!detail && !AsyncResult.isFailure(state) && <LoadingRows />}
        {detail && (
          <AgentResourceViewer
            resource={detail.resource}
            content={detail.content}
            truncated={detail.truncated}
            supportingResources={resources.length > 0 ? resources : detail.supportingResources}
          />
        )}
      </main>
      {inspectorOpen && (
        <ResizableInspector className="agents-inspector" label="Agent resource context">
          <div className="inspector-heading">
            <span>Resource details</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close inspector"
              onClick={() => setInspectorOpen(false)}
            >
              <X />
            </Button>
          </div>
          <div className="agents-inspector-body">
            <h2>Source & supporting files</h2>
            {detail && (
              <>
                <dl>
                  <div>
                    <dt>Type</dt>
                    <dd>{resourceKinds[detail.resource.kind]}</dd>
                  </div>
                  <div>
                    <dt>Modified</dt>
                    <dd>{formatDate(detail.resource.modifiedAt)}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatSize(detail.resource.sizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>Local Drive copy</dd>
                  </div>
                </dl>
                <p className="agents-path">{detail.resource.relativePath}</p>
                {detail.supportingResources.length > 0 && (
                  <div className="agents-support">
                    <h3>Related to this skill</h3>
                    {detail.supportingResources.map((resource) => (
                      <Link
                        key={resource.id}
                        to="/"
                        search={{ section: "agents", resource: resource.id }}
                      >
                        <FileText size={16} />
                        <span>
                          {resource.name}
                          <small>{resourceKinds[resource.kind]}</small>
                        </span>
                        <ArrowRight size={14} />
                      </Link>
                    ))}
                  </div>
                )}
                <p className="agents-secondary-note">
                  You’re viewing a file from the working copy. Preview shows its content without
                  running scripts or enabling agent instructions.
                </p>
              </>
            )}
          </div>
        </ResizableInspector>
      )}
    </div>
  )
}
