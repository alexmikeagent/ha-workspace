import { useEffect } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useAtom, useAtomMount, useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/unstable/reactivity"
import type { Catalog, FileDetails, WorkspaceFile } from "@ha/domain/workspace"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FolderClosed,
  HardDrive,
  Image as ImageIcon,
  Layers2,
  Menu,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "@workspace/ui/components/icons"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@workspace/ui/components/sheet"
import { ResizableInspector } from "@/features/workspace/resizable-inspector"
import {
  desktopSidebarOpenAtom,
  filePageAtom,
  formatDate,
  formatSize,
  inspectorOpenAtom,
  inspectorTabAtom,
  sidebarOpenAtom,
  sortAtom,
  validateWorkspaceSearch,
  type WorkspaceSearch,
  type WorkspaceSection,
} from "@/features/workspace/state"
import {
  catalogKey,
  versionUrl,
  workspaceCatalog,
  workspaceFile,
  workspaceRuntime,
} from "@/features/workspace/catalog"
import {
  ContextPanel,
  DocumentPreview,
  errorOf,
  LoadingRows,
  Notice,
  ReviewPanel,
  valueOf,
} from "@/features/workspace/document"

const sections = [
  {
    id: "companies",
    label: "Companies",
    icon: Building2,
    description: "Company context, project files, and the details that connect them.",
  },
  {
    id: "reports",
    label: "Reports",
    icon: FileText,
    description: "Field observations and finished reports, together with their source files.",
  },
  {
    id: "invoices",
    label: "Invoices",
    icon: ReceiptText,
    description: "Find an invoice and keep its company and project within reach.",
  },
  {
    id: "templates",
    label: "Templates",
    icon: Layers2,
    description: "Browse the retained references behind your reports and invoices.",
  },
] as const

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: validateWorkspaceSearch,
  component: Workspace,
})

function Navigation({
  section,
  catalog,
  close,
}: {
  section: WorkspaceSection
  catalog?: Catalog
  close?: () => void
}) {
  return (
    <>
      <div className="workspace-brand">
        <span className="brand-mark" aria-hidden="true">
          HA
        </span>
        <strong>{import.meta.env.VITE_APP_NAME}</strong>
      </div>
      <div className="nav-group-label">Workspace</div>
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
      <div className="sidebar-collections">
        <div className="nav-group-label">Connected source</div>
        <div className="source-row">
          <HardDrive size={17} />
          <div>
            <strong>Local Drive</strong>
            <span>
              {catalog
                ? `${catalog.fileCount.toLocaleString()} indexed files`
                : "Connecting to your files…"}
            </span>
          </div>
        </div>
        <p>Your working copy. Changes in the original Drive stay separate.</p>
      </div>
      <div className="sidebar-footer">
        <div className="profile-avatar">HA</div>
        <div>
          <strong>HA Consulting</strong>
          <span>Local owner</span>
        </div>
        <ShieldCheck size={17} />
      </div>
    </>
  )
}

function Workspace() {
  const search = Route.useSearch()
  const current = sections.find((item) => item.id === search.section) ?? sections[0]
  const [mobileOpen, setMobileOpen] = useAtom(sidebarOpenAtom)
  const [desktopOpen, setDesktopOpen] = useAtom(desktopSidebarOpenAtom)
  const [inspectorOpen, setInspectorOpen] = useAtom(inspectorOpenAtom)
  useAtomMount(workspaceRuntime)
  const state = useAtomValue(workspaceCatalog(catalogKey(search)))
  const catalog = valueOf(state)
  const company = catalog?.companies.find((item) => item.id === search.company)
  const project = catalog?.projects.find((item) => item.id === search.project)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "b"
      )
        return
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input,textarea,select,[contenteditable='true']")
      )
        return
      event.preventDefault()
      if (window.matchMedia("(max-width: 760px)").matches) setMobileOpen((open) => !open)
      else setDesktopOpen((open) => !open)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setDesktopOpen, setMobileOpen])

  return (
    <div
      className={`workspace-shell connected-shell ${search.file ? "has-document" : "has-catalog"}`}
      data-sidebar={desktopOpen ? "expanded" : "collapsed"}
    >
      <a href="#workspace-main" className="skip-link">
        Skip to workspace
      </a>
      <div className="sidebar-toggle-wrap">
        <Button
          className="desktop-sidebar-toggle"
          variant="ghost"
          size="icon"
          onClick={() => setDesktopOpen(!desktopOpen)}
          aria-label={desktopOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={desktopOpen}
          aria-controls="desktop-navigation"
          aria-keyshortcuts="Control+B Meta+B"
          aria-describedby="sidebar-toggle-tip"
        >
          {desktopOpen ? <PanelLeftClose /> : <PanelLeft />}
        </Button>
        <span id="sidebar-toggle-tip" role="tooltip">
          {desktopOpen ? "Collapse" : "Expand"} sidebar <kbd>Ctrl / ⌘ B</kbd>
        </span>
      </div>
      <aside id="desktop-navigation" className="desktop-sidebar" inert={!desktopOpen}>
        <div className="sidebar-inner">
          <Navigation section={search.section} catalog={catalog} />
        </div>
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="mobile-sidebar">
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Browse companies, reports, invoices, and templates.
          </SheetDescription>
          <Navigation
            section={search.section}
            catalog={catalog}
            close={() => setMobileOpen(false)}
          />
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
            <Link to="/" search={{ section: search.section }} className="breadcrumb-home">
              {current.label}
            </Link>
            {company && (
              <>
                <ChevronRight size={13} />
                <Link to="/" search={{ section: search.section, company: company.id }}>
                  {company.name}
                </Link>
              </>
            )}
            {project && (
              <>
                <ChevronRight size={13} />
                <span>{project.name}</span>
              </>
            )}
            {search.file && (
              <>
                <ChevronRight size={13} />
                <strong>Document</strong>
              </>
            )}
          </div>
          <div className="topbar-actions">
            <span className="connection-label">
              <span className={AsyncResult.isFailure(state) ? "status-dot issue" : "status-dot"} />
              {AsyncResult.isFailure(state)
                ? "Connection interrupted"
                : catalog
                  ? "Local workspace"
                  : "Connecting…"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              aria-label={inspectorOpen ? "Close inspector" : "Open inspector"}
              aria-expanded={inspectorOpen}
            >
              <PanelRight />
            </Button>
          </div>
        </header>
        {search.file ? (
          <FileWorkspace fileId={search.file} search={search} catalog={catalog} />
        ) : (
          <div className="workspace-columns">
            <main id="workspace-main" className="workspace-main catalog-main">
              <div className="page-heading">
                <div>
                  <h1>{project?.name ?? company?.name ?? current.label}</h1>
                  <p>
                    {company
                      ? `${company.fileCount.toLocaleString()} files across ${company.projectCount} ${company.projectCount === 1 ? "project" : "projects"}.`
                      : current.description}
                  </p>
                </div>
              </div>
              {AsyncResult.isFailure(state) && (
                <output className="connection-banner">
                  {errorOf(state)}
                  {catalog && " Showing the last available files."}
                </output>
              )}
              <CatalogControls search={search} catalog={catalog} />
              {catalog ? (
                <CatalogContent search={search} catalog={catalog} />
              ) : AsyncResult.isFailure(state) ? (
                <ConnectionFailure search={search} />
              ) : (
                <LoadingRows />
              )}
            </main>
            {inspectorOpen && <CatalogInspector catalog={catalog} />}
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectionFailure({ search }: { search: WorkspaceSearch }) {
  const retry = useAtomRefresh(workspaceCatalog(catalogKey(search)))
  const retryConnection = useAtomRefresh(workspaceRuntime)
  return (
    <Notice
      title="Let's reconnect your workspace"
      retry={() => {
        retryConnection()
        retry()
      }}
    >
      The local service is not ready. Your copied files remain in place.
    </Notice>
  )
}

function CatalogControls({ search, catalog }: { search: WorkspaceSearch; catalog?: Catalog }) {
  const navigate = useNavigate()
  const [sort, setSort] = useAtom(sortAtom)
  const projects =
    catalog?.projects.filter((item) => !search.company || item.companyId === search.company) ?? []
  return (
    <div className="catalog-controls">
      <search>
        <form
          className="catalog-search"
          onSubmit={(event) => {
            event.preventDefault()
            const query = new FormData(event.currentTarget).get("search")
            void navigate({
              to: "/",
              search: {
                ...search,
                q: typeof query === "string" && query.trim() ? query.trim() : undefined,
              },
            })
          }}
        >
          <Search size={17} />
          <label className="sr-only" htmlFor="catalog-search">
            Search files and source context
          </label>
          <input
            key={search.q ?? "empty"}
            id="catalog-search"
            name="search"
            type="search"
            placeholder="Search files and context…"
            defaultValue={search.q ?? ""}
            maxLength={300}
          />
          <button type="submit" aria-label="Search">
            <ArrowRight size={16} />
          </button>
        </form>
      </search>
      <div className="filter-row">
        <label>
          <span className="sr-only">Company filter</span>
          <select
            aria-label="Filter by company"
            value={search.company ?? ""}
            onChange={(event) => {
              void navigate({
                to: "/",
                search: { ...search, company: event.target.value || undefined, project: undefined },
              })
            }}
          >
            <option value="">All companies</option>
            {catalog?.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Project filter</span>
          <select
            aria-label="Filter by project"
            value={search.project ?? ""}
            onChange={(event) => {
              void navigate({
                to: "/",
                search: { ...search, project: event.target.value || undefined },
              })
            }}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sort-select">
          <span className="sr-only">Sort files</span>
          <select
            aria-label="Sort files"
            value={sort}
            onChange={(event) => setSort(event.target.value === "name" ? "name" : "recent")}
          >
            <option value="recent">Recently modified</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      {(search.q || search.company || search.project) && (
        <div className="active-filters">
          <span>{search.q ? `Results for “${search.q}”` : "Filtered view"}</span>
          <Link to="/" search={{ section: search.section }}>
            <X size={12} /> Clear filters
          </Link>
        </div>
      )}
    </div>
  )
}

function CatalogContent({ search, catalog }: { search: WorkspaceSearch; catalog: Catalog }) {
  const sort = useAtomValue(sortAtom)
  const [page, setPage] = useAtom(filePageAtom(catalogKey(search)))
  const sorted = [...catalog.files].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : b.modifiedAt - a.modifiedAt,
  )
  const pageCount = Math.max(1, Math.ceil(sorted.length / 50))
  const currentPage = Math.min(page, pageCount)
  const visible = sorted.slice((currentPage - 1) * 50, currentPage * 50)
  const showCompanies =
    search.section === "companies" && !search.company && !search.project && !search.q
  return (
    <>
      {showCompanies && catalog.companies.length > 0 && (
        <section className="company-section" aria-label="Companies">
          <div className="list-heading">
            <h2>Your companies</h2>
            <span>{catalog.companies.length} companies</span>
          </div>
          <div className="company-grid">
            {catalog.companies.map((company) => (
              <Link
                to="/"
                search={{ ...search, company: company.id }}
                key={company.id}
                className="company-card"
              >
                <div className="company-card-top">
                  <span className="company-monogram">
                    {company.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((word) => word[0])
                      .join("")}
                  </span>
                  <ChevronRight size={17} />
                </div>
                <h3>{company.name}</h3>
                <p>
                  {company.projectCount} {company.projectCount === 1 ? "project" : "projects"}
                  <span>·</span>
                  {company.fileCount.toLocaleString()} files
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
      {search.company && !search.project && (
        <section className="project-section" aria-label="Projects">
          <div className="project-links">
            {catalog.projects
              .filter((project) => project.companyId === search.company)
              .map((project) => (
                <Link to="/" search={{ ...search, project: project.id }} key={project.id}>
                  <FolderClosed size={15} />
                  <span>{project.name}</span>
                  <small>{project.fileCount}</small>
                </Link>
              ))}
          </div>
        </section>
      )}
      <div className="list-heading">
        <h2>{search.section === "companies" ? "Files" : `Your ${search.section}`}</h2>
        <span>
          {catalog.matchedFileCount.toLocaleString()}{" "}
          {catalog.matchedFileCount === 1 ? "file" : "files"}
          {catalog.truncated ? ` · showing ${catalog.files.length}` : ""}
        </span>
      </div>
      {visible.length ? (
        <>
          <div className="file-list">
            <div className="file-list-labels" aria-hidden="true">
              <span>Name</span>
              <span>Modified</span>
              <span>Size</span>
              <span />
            </div>
            {visible.map((file) => (
              <FileRow key={file.id} file={file} catalog={catalog} search={search} />
            ))}
          </div>
          {catalog.truncated && (
            <p className="result-limit">
              This view shows the first {catalog.files.length} matches. Choose a company, project,
              or search term to narrow it down.
            </p>
          )}
          <div className="list-pagination">
            <span>
              {(currentPage - 1) * 50 + 1}–{Math.min(currentPage * 50, sorted.length)} of{" "}
              {sorted.length.toLocaleString()} shown
            </span>
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                {currentPage} / {pageCount}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Notice
          title={
            catalog.fileCount === 0
              ? "Your first import is being prepared"
              : "No files match this view"
          }
        >
          {catalog.fileCount === 0
            ? "Files will appear here as the local catalog finishes indexing."
            : "Try a different company, project, or search term."}
        </Notice>
      )}
    </>
  )
}

function FileRow({
  file,
  catalog,
  search,
}: {
  file: WorkspaceFile
  catalog: Catalog
  search: WorkspaceSearch
}) {
  const company = catalog.companies.find((item) => item.id === file.companyId)
  const project = catalog.projects.find((item) => item.id === file.projectId)
  const isImage = /^(jpe?g|png|gif|webp|heic)$/i.test(file.extension.replace(/^\./, ""))
  return (
    <Link
      to="/"
      search={{ ...search, file: file.id, version: undefined }}
      className="file-row"
      title={file.name}
    >
      <div className="file-identity">
        <span className={`file-glyph ${isImage ? "photo" : file.category}`}>
          {isImage ? (
            <ImageIcon size={19} />
          ) : file.category === "invoices" ? (
            <ReceiptText size={19} />
          ) : (
            <FileText size={19} />
          )}
        </span>
        <div>
          <strong>{file.name}</strong>
          <p>
            {company?.name ?? "Unassigned company"}
            {project && (
              <>
                <span> / </span>
                {project.name}
              </>
            )}
            <span className="format-badge">
              {file.extension.replace(/^\./, "").toUpperCase() || "FILE"}
            </span>
          </p>
        </div>
      </div>
      <time dateTime={new Date(file.modifiedAt).toISOString()}>{formatDate(file.modifiedAt)}</time>
      <span className="file-size">{formatSize(file.size)}</span>
      <ChevronRight size={15} />
    </Link>
  )
}

function CatalogInspector({ catalog }: { catalog?: Catalog }) {
  const [, setInspectorOpen] = useAtom(inspectorOpenAtom)
  return (
    <ResizableInspector className="catalog-inspector" label="Workspace context">
      <div className="inspector-heading">
        <span>Workspace context</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close inspector"
          onClick={() => setInspectorOpen(false)}
        >
          <X />
        </Button>
      </div>
      <div className="file-context">
        <div className="context-intro">
          <HardDrive size={23} />
          <h2>Your files, within reach.</h2>
          <p>A separate working copy keeps the original Drive intact.</p>
        </div>
        <dl className="metadata-list">
          <div>
            <dt>Source</dt>
            <dd>Local Drive copy</dd>
          </div>
          <div>
            <dt>Indexed files</dt>
            <dd>{catalog?.fileCount.toLocaleString() ?? "Connecting…"}</dd>
          </div>
          <div>
            <dt>Companies</dt>
            <dd>{catalog?.companies.length ?? "—"}</dd>
          </div>
          <div>
            <dt>Projects</dt>
            <dd>{catalog?.projects.length ?? "—"}</dd>
          </div>
          <div>
            <dt>Last import</dt>
            <dd>{catalog?.importedAt ? formatDate(catalog.importedAt) : "In progress"}</dd>
          </div>
        </dl>
        <div className="context-help">
          <span>
            <Check size={14} /> Browse company and project files
          </span>
          <span>
            <Check size={14} /> Preview a source document
          </span>
          <span>
            <Check size={14} /> Keep comments with a version
          </span>
        </div>
        <p className="context-inference">
          Folder names inform the groupings. They do not establish contract terms or template
          approval.
        </p>
      </div>
      <div className="inspector-bottom">
        <ShieldCheck size={13} />
        Original files stay separate
      </div>
    </ResizableInspector>
  )
}

function FileWorkspace({
  fileId,
  search,
  catalog,
}: {
  fileId: string
  search: WorkspaceSearch
  catalog?: Catalog
}) {
  const state = useAtomValue(workspaceFile(fileId))
  const retry = useAtomRefresh(workspaceFile(fileId))
  const details = valueOf(state)
  return !details ? (
    <main id="workspace-main" className="workspace-main">
      <Link
        className="back-to-files"
        to="/"
        search={{ ...search, file: undefined, version: undefined }}
      >
        <ArrowLeft size={15} />
        Back to files
      </Link>
      {AsyncResult.isFailure(state) ? (
        <Notice title="This document could not be opened" retry={retry}>
          {errorOf(state)}
        </Notice>
      ) : (
        <LoadingRows />
      )}
    </main>
  ) : (
    <ReadyFileWorkspace
      details={details}
      search={search}
      catalog={catalog}
      connectionError={AsyncResult.isFailure(state) ? errorOf(state) : undefined}
    />
  )
}

function ReadyFileWorkspace({
  details,
  search,
  catalog,
  connectionError,
}: {
  details: FileDetails
  search: WorkspaceSearch
  catalog?: Catalog
  connectionError?: string
}) {
  const navigate = useNavigate()
  const [inspectorOpen, setInspectorOpen] = useAtom(inspectorOpenAtom)
  const [tab, setTab] = useAtom(inspectorTabAtom)
  const version =
    details.versions.find((item) => item.id === search.version) ??
    details.versions.find((item) => item.id === details.file.currentVersionId) ??
    details.versions[0]
  if (!version)
    return (
      <main id="workspace-main" className="workspace-main">
        <Notice title="This file has no indexed revision yet">
          Try reopening it once indexing finishes.
        </Notice>
      </main>
    )
  const companyName = catalog?.companies.find((item) => item.id === details.file.companyId)?.name
  const projectName = catalog?.projects.find((item) => item.id === details.file.projectId)?.name
  return (
    <div className="workspace-columns document-columns">
      <main id="workspace-main" className="document-main">
        <div className="document-heading">
          <div>
            <Link
              className="back-to-files"
              to="/"
              search={{ ...search, file: undefined, version: undefined }}
            >
              <ArrowLeft size={14} />
              Back to files
            </Link>
            <h1 title={details.file.name}>{details.file.name}</h1>
            <p>
              {companyName ?? "Unassigned company"}
              {projectName && ` / ${projectName}`}
            </p>
          </div>
          <a
            className={buttonVariants({ variant: "outline" })}
            aria-label="Download document"
            href={versionUrl(details.file.id, version.id, "download")}
          >
            <Download size={14} />
            <span>Download</span>
          </a>
        </div>
        <div className="document-version-bar">
          <label>
            <span className="sr-only">Document version</span>
            <select
              aria-label="Document version"
              value={version.id}
              onChange={(event) => {
                void navigate({ to: "/", search: { ...search, version: event.target.value } })
              }}
            >
              {details.versions.map((item) => (
                <option key={item.id} value={item.id}>
                  Version {item.number}
                  {item.id === details.file.currentVersionId ? " · Current" : ""}
                </option>
              ))}
            </select>
          </label>
          <span>
            {formatDate(version.modifiedAt)}
            <span>·</span>
            {formatSize(version.size)}
          </span>
          <span className="version-status">
            <Check size={12} />
            {version.id === details.file.currentVersionId ? "Current version" : "Earlier version"}
          </span>
        </div>
        {connectionError && (
          <output className="connection-banner">
            {connectionError} Showing the last available version.
          </output>
        )}
        {search.version && search.version !== version.id && (
          <output className="connection-banner">
            The requested version is unavailable. Showing the current version.
          </output>
        )}
        <DocumentPreview details={details} version={version} />
      </main>
      {inspectorOpen && (
        <ResizableInspector className="document-inspector" label="Document inspector">
          <div className="inspector-heading">
            <span>Document workspace</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close inspector"
              onClick={() => setInspectorOpen(false)}
            >
              <X />
            </Button>
          </div>
          <fieldset className="inspector-tabs" aria-label="Inspector view">
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
          {tab === "review" ? (
            <ReviewPanel details={details} version={version} search={search} />
          ) : tab === "context" ? (
            <ContextPanel
              details={details}
              version={version}
              companyName={companyName}
              projectName={projectName}
            />
          ) : (
            <div className="agent-availability">
              <Sparkles size={24} />
              <h2>Context comes first.</h2>
              <p>
                You can review source facts and leave versioned comments now. Document generation
                and agent execution are not connected yet.
              </p>
              <Button variant="outline" onClick={() => setTab("context")}>
                View source context
                <ArrowRight size={14} />
              </Button>
            </div>
          )}
        </ResizableInspector>
      )}
    </div>
  )
}
