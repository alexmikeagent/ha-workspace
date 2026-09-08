import { useId, useMemo, type CSSProperties } from "react"
import { useAtom, useAtomValue } from "@effect/atom-react"
import { Atom, AsyncResult } from "effect/unstable/reactivity"
import type { AgentResource } from "@ha/domain/agent-library"
import { Link } from "@tanstack/react-router"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  highlightLimit,
  highlightRuntime,
  highlightSource,
  sourceLanguage,
  type SourceLanguage,
  type SourceTokens,
} from "./highlight"
import { sanitizeAgentHtml } from "./html-preview"
import { linkedAgentResource } from "./resource-links"
import "./resource-viewer.css"

type ViewMode = "source" | "preview"
const viewMode = Atom.family((_id: string) => Atom.make<ViewMode | null>(null))

export function SourceLines({
  content,
  tokens,
  label,
  numbered = true,
}: {
  readonly content: string
  readonly tokens?: SourceTokens
  readonly label: string
  readonly numbered?: boolean
}) {
  if (!tokens && highlightLimit(content))
    return (
      <pre
        className="agent-code"
        aria-label={label}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to reach and scroll the source region.
        tabIndex={0}
      >
        <code>{content}</code>
      </pre>
    )
  const lines: SourceTokens = tokens ?? content.split(/\r?\n/).map((line) => [{ content: line }])
  return (
    <pre
      className={`agent-code ${numbered ? "agent-code-numbered" : ""}`}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to reach and scroll the source region.
      tabIndex={0}
      aria-label={label}
    >
      <code>
        {lines.map((line, index) => (
          <span className="agent-code-line" key={index} data-line={index + 1}>
            {line.map((token, tokenIndex) => (
              <span
                key={tokenIndex}
                style={
                  {
                    color: token.color,
                    fontStyle: Math.max(token.fontStyle ?? 0, 0) & 1 ? "italic" : undefined,
                    fontWeight: Math.max(token.fontStyle ?? 0, 0) & 2 ? 600 : undefined,
                    textDecoration: Math.max(token.fontStyle ?? 0, 0) & 4 ? "underline" : undefined,
                  } satisfies CSSProperties
                }
              >
                {token.content}
              </span>
            ))}
            {index < lines.length - 1 ? "\n" : null}
          </span>
        ))}
      </code>
    </pre>
  )
}

function HighlightedSource({
  content,
  language,
  label,
  numbered,
}: {
  readonly content: string
  readonly language: SourceLanguage
  readonly label: string
  readonly numbered?: boolean
}) {
  const atom = useMemo(
    () => highlightRuntime.atom(highlightSource(content, language)),
    [content, language],
  )
  const state = useAtomValue(atom)
  return (
    <>
      {AsyncResult.isFailure(state) && (
        <p className="agent-viewer-note">
          Syntax colors are unavailable. The source is shown below.
        </p>
      )}
      <SourceLines
        content={content}
        tokens={AsyncResult.isSuccess(state) ? state.value : undefined}
        label={label}
        numbered={numbered}
      />
    </>
  )
}

function SourceCode({
  content,
  language,
  label,
  numbered = true,
}: {
  readonly content: string
  readonly language: SourceLanguage
  readonly label: string
  readonly numbered?: boolean
}) {
  if (language === "text" || highlightLimit(content))
    return (
      <>
        {highlightLimit(content) && (
          <p className="agent-viewer-note">Shown as plain text to keep this file responsive.</p>
        )}
        <SourceLines content={content} label={label} numbered={numbered} />
      </>
    )
  return (
    <HighlightedSource content={content} language={language} label={label} numbered={numbered} />
  )
}

export function MarkdownResourcePreview({
  content,
  relativePath = "",
  supportingResources = [],
}: {
  readonly content: string
  readonly relativePath?: string
  readonly supportingResources?: readonly AgentResource[]
}) {
  if (highlightLimit(content))
    return (
      <>
        <p className="agent-viewer-note">
          This long resource is shown as source text to keep browsing responsive.
        </p>
        <SourceLines content={content} label="Markdown source" />
      </>
    )
  return (
    <article className="agent-markdown-preview">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url, key) => (key === "href" ? url : undefined)}
        components={{
          a: ({ href, children }) => {
            const linked = href
              ? linkedAgentResource(href, relativePath, supportingResources)
              : undefined
            if (linked)
              return (
                <Link to="/" search={{ section: "agents", resource: linked.id }}>
                  {children}
                </Link>
              )
            if (href?.startsWith("#")) return <a href={href}>{children}</a>
            return (
              <span className="agent-preview-link" title={href}>
                {children}
              </span>
            )
          },
          img: ({ alt }) => (
            <span className="agent-image-placeholder">Image: {alt || "embedded image"}</span>
          ),
          pre: ({ children }) => <div className="agent-markdown-code">{children}</div>,
          code: ({ className, children }) => {
            const code = typeof children === "string" ? children : ""
            const language = /language-([^\s]+)/.exec(className ?? "")?.[1]
            return language || code.includes("\n") ? (
              <SourceCode
                content={code.replace(/\n$/, "")}
                language={sourceLanguage(language ?? "text")}
                label="Code example"
                numbered={false}
              />
            ) : (
              <code>{children}</code>
            )
          },
        }}
      >
        {content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")}
      </Markdown>
    </article>
  )
}

function HtmlResourcePreview({
  content,
  name,
}: {
  readonly content: string
  readonly name: string
}) {
  const document = useMemo(() => sanitizeAgentHtml(content), [content])
  return (
    <iframe
      className="agent-html-preview"
      title={`${name} static preview`}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={document}
    />
  )
}

export function AgentResourceViewer({
  resource,
  content,
  truncated,
  supportingResources,
}: {
  readonly resource: AgentResource
  readonly content: string
  readonly truncated: boolean
  readonly supportingResources?: readonly AgentResource[]
}) {
  const language = sourceLanguage(resource.relativePath)
  const hasPreview = language === "markdown" || language === "html"
  const [selected, setSelected] = useAtom(viewMode(resource.id))
  const mode = hasPreview
    ? (selected ?? (language === "markdown" ? "preview" : "source"))
    : "source"
  const panelId = useId()
  return (
    <section className="agent-resource-viewer" aria-label={`${resource.name} viewer`}>
      <div className="agent-viewer-toolbar">
        {hasPreview ? (
          <fieldset className="agent-viewer-modes" aria-label="Resource view">
            <button
              type="button"
              aria-pressed={mode === "source"}
              aria-controls={panelId}
              onClick={() => setSelected("source")}
            >
              Source
            </button>
            <button
              type="button"
              aria-pressed={mode === "preview"}
              aria-controls={panelId}
              onClick={() => setSelected("preview")}
            >
              Preview
            </button>
          </fieldset>
        ) : (
          <span className="agent-viewer-language">
            {language === "text" ? "Plain text" : language === "shellscript" ? "Shell" : language}
          </span>
        )}
        <span className="agent-viewer-readonly">Read only</span>
      </div>
      {truncated && (
        <output className="agent-viewer-note">This preview shows the beginning of the file.</output>
      )}
      <div className={`agent-viewer-body agent-viewer-${mode}`} id={panelId}>
        {mode === "source" ? (
          <SourceCode content={content} language={language} label={`${resource.name} source`} />
        ) : language === "markdown" ? (
          <MarkdownResourcePreview
            content={content}
            relativePath={resource.relativePath}
            supportingResources={supportingResources}
          />
        ) : (
          <HtmlResourcePreview content={content} name={resource.name} />
        )}
      </div>
    </section>
  )
}
