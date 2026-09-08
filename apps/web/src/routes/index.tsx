import { createFileRoute, Link } from "@tanstack/react-router"
import { useAtom, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/unstable/reactivity"
import {
  Building2,
  FileText,
  ReceiptText,
  Layers2,
  PanelRight,
  Menu,
  ArrowUpRight,
  ChevronRight,
  FolderOpen,
  FileCheck2,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  CircleDashed,
  Settings2,
  HardDrive,
  ArrowRight,
  X,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@workspace/ui/components/sheet"
import {
  inspectorOpenAtom,
  inspectorTabAtom,
  sidebarOpenAtom,
  type WorkspaceSection,
} from "@/features/workspace/state"
import { workspaceFiles } from "@/features/workspace/catalog"

const sections = [
  {
    id: "companies",
    label: "Companies",
    icon: Building2,
    description: "Your companies and their project files.",
  },
  {
    id: "reports",
    label: "Reports",
    icon: FileText,
    description: "Field notes, finished reports, and everything between.",
  },
  {
    id: "invoices",
    label: "Invoices",
    icon: ReceiptText,
    description: "Client invoices with the source facts close at hand.",
  },
  {
    id: "templates",
    label: "Templates",
    icon: Layers2,
    description: "The right starting point for each company and project.",
  },
] as const

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { section: WorkspaceSection } => ({
    section: sections.find((item) => item.id === search.section)?.id ?? "companies",
  }),
  component: Workspace,
})

function Navigation({ section, close }: { section: WorkspaceSection; close?: () => void }) {
  return (
    <>
      <div className="workspace-brand">
        <span className="brand-mark">
          H<span>A</span>
        </span>
        <div>
          <strong>{import.meta.env.VITE_APP_NAME}</strong>
          <span>Personal workspace</span>
        </div>
      </div>
      <div className="nav-group-label">WORKSPACE</div>
      <nav aria-label="Workspace navigation" className="workspace-nav">
        {sections.map((item) => (
          <Link
            key={item.id}
            to="/"
            search={{ section: item.id }}
            onClick={close}
            className={section === item.id ? "nav-item active" : "nav-item"}
            aria-current={section === item.id ? "page" : undefined}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
            {section === item.id && <span className="nav-dot" />}
          </Link>
        ))}
      </nav>
      <div className="sidebar-note">
        <div className="mini-orbit">
          <HardDrive size={18} />
        </div>
        <strong>A local beginning</strong>
        <p>Your first workspace will use a separate copy of your files.</p>
        <span>
          Import is the next step <ArrowUpRight size={13} />
        </span>
      </div>
      <div className="sidebar-footer">
        <div className="profile-avatar">HA</div>
        <div>
          <strong>HA Consulting</strong>
          <span>Foundation preview</span>
        </div>
        <ShieldCheck size={17} />
      </div>
    </>
  )
}

function Workspace() {
  const { section } = Route.useSearch()
  const current = sections.find((item) => item.id === section) ?? sections[0]
  const [mobileOpen, setMobileOpen] = useAtom(sidebarOpenAtom)
  const [inspectorOpen, setInspectorOpen] = useAtom(inspectorOpenAtom)
  const [tab, setTab] = useAtom(inspectorTabAtom)
  const catalog = useAtomValue(workspaceFiles(section))

  return (
    <div className="workspace-shell">
      <a href="#workspace-main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="desktop-sidebar">
        <Navigation section={section} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="mobile-sidebar">
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">Choose a workspace section.</SheetDescription>
          <Navigation section={section} close={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="workspace-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <Button
              className="mobile-menu"
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <span className="breadcrumb-home">Workspace</span>
            <ChevronRight size={14} />
            <strong>{current.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="preview-label">
              <span />
              Foundation preview
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              aria-label={inspectorOpen ? "Close workspace context" : "Open workspace context"}
              aria-expanded={inspectorOpen}
            >
              <PanelRight />
            </Button>
          </div>
        </header>
        <div className="workspace-columns">
          <main id="workspace-main" className="workspace-main" key={section}>
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR WORK, TOGETHER</span>
                <h1>{current.label}</h1>
                <p>{current.description}</p>
              </div>
              <span className="section-icon">
                <current.icon size={23} />
              </span>
            </div>
            <section className="welcome-panel" aria-label="Workspace introduction">
              <div className="welcome-copy">
                <span className="small-tag">
                  <span />A fresh workspace
                </span>
                <h2>
                  Less searching.
                  <br />
                  <span>More room to work.</span>
                </h2>
                <p>
                  Keep each file with its company, review changes in place, and carry the right
                  context into the next task.
                </p>
                <Button
                  className="context-button"
                  onClick={() => {
                    setInspectorOpen(true)
                    setTab("context")
                  }}
                >
                  View workspace setup <ArrowRight size={16} />
                </Button>
              </div>
              <div className="file-art" aria-hidden="true">
                <div className="art-halo" />
                <div className="art-file back">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="art-file front">
                  <div className="art-file-header">
                    <FileText size={20} />
                    <span>FIELD REPORT</span>
                  </div>
                  <div className="art-title" />
                  <div className="art-line long" />
                  <div className="art-line" />
                  <div className="art-grid">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="art-foot">
                    <span />
                    <FileCheck2 size={17} />
                  </div>
                </div>
                <div className="art-comment">
                  <MessageSquare size={15} />
                  <span>Every detail, in context</span>
                </div>
              </div>
            </section>
            <div className="list-heading">
              <div>
                <h2>
                  {section === "companies"
                    ? "Your companies"
                    : `Your ${current.label.toLowerCase()}`}
                </h2>
                <span>Waiting for the first import</span>
              </div>
              <span className="quiet-count">—</span>
            </div>
            <section className="empty-catalog" aria-live="polite">
              <span className="empty-icon">
                <FolderOpen size={27} />
              </span>
              <h3>
                {AsyncResult.isInitial(catalog)
                  ? "Preparing your workspace…"
                  : "Ready for your files"}
              </h3>
              <p>
                The interface is ready to explore. Your local copy will appear here once the catalog
                is connected.
              </p>
              <span className="empty-status">
                <CircleDashed size={14} />
                Catalog connection pending
              </span>
            </section>
            <div className="principles">
              <span>
                <ShieldCheck size={15} />
                Originals stay separate
              </span>
              <span>
                <Layers2 size={15} />
                Changes become revisions
              </span>
              <span>
                <MessageSquare size={15} />
                Context stays with the file
              </span>
            </div>
          </main>
          {inspectorOpen && (
            <aside className="workspace-inspector" aria-label="Workspace context">
              <div className="inspector-heading">
                <span>
                  <Settings2 size={15} />
                  Workspace context
                </span>
                <Button
                  className="inspector-close"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close context"
                  onClick={() => setInspectorOpen(false)}
                >
                  <X />
                </Button>
              </div>
              <fieldset className="inspector-tabs" aria-label="Context view">
                {(["review", "context", "agent"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => setTab(item)}
                    aria-pressed={tab === item}
                    className={tab === item ? "selected" : ""}
                  >
                    {item[0].toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </fieldset>
              {tab === "context" ? (
                <div className="inspector-content">
                  <span className="inspector-symbol">
                    <HardDrive size={23} />
                  </span>
                  <h2>A thoughtful foundation</h2>
                  <p>A small first step toward a workspace built around your files.</p>
                  <ol className="setup-list">
                    <li>
                      <span className="step-number complete">01</span>
                      <div>
                        <strong>Explore the workspace</strong>
                        <p>Navigation, layout, and context panels are ready.</p>
                        <span className="step-label">Available now</span>
                      </div>
                    </li>
                    <li>
                      <span className="step-number">02</span>
                      <div>
                        <strong>Connect the local catalog</strong>
                        <p>Read company files from the separate working copy.</p>
                        <span className="step-label muted">Next implementation</span>
                      </div>
                    </li>
                    <li>
                      <span className="step-number">03</span>
                      <div>
                        <strong>Review the first document</strong>
                        <p>Open a preview, add a comment, and create a new revision.</p>
                        <span className="step-label muted">Planned</span>
                      </div>
                    </li>
                  </ol>
                  <div className="inspector-note">
                    <ShieldCheck size={17} />
                    <p>This preview has no document write actions.</p>
                  </div>
                </div>
              ) : (
                <div className="inspector-content panel-empty">
                  <span className="inspector-symbol">
                    {tab === "review" ? <MessageSquare size={23} /> : <Sparkles size={23} />}
                  </span>
                  <h2>{tab === "review" ? "A place for the details" : "Help, with context"}</h2>
                  <p>
                    {tab === "review"
                      ? "Open a document after import to review its pages and leave a precise comment."
                      : "Agent instructions and task context will live here. Agent execution is not connected yet."}
                  </p>
                  <span className="empty-status">
                    {tab === "review" ? "Document preview planned" : "Agent connection planned"}
                  </span>
                </div>
              )}
              <div className="inspector-bottom">
                <span className="status-dot" />
                Setup milestone <span>01 / 03</span>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
