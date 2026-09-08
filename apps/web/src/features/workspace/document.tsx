import { useAtom, useAtomMount, useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { FileDetails, FileVersion } from "@ha/domain/workspace"
import { Option } from "effect"
import { AsyncResult, Atom } from "effect/unstable/reactivity"
import {
  Check,
  Download,
  FileQuestion,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  addReviewComment,
  editReviewDraft,
  fileContext,
  loadReviewDraft,
  previewInfo,
  reviewDraft,
  versionUrl,
} from "./catalog"
import { clientErrorMessage } from "./browser-services"
import { formatDate, formatSize, type WorkspaceSearch } from "./state"
import { RevisionPanel } from "./revision"

export const valueOf = <A, E>(state: AsyncResult.AsyncResult<A, E>) =>
  Option.getOrUndefined(AsyncResult.value(state))
export const errorOf = <A, E>(state: AsyncResult.AsyncResult<A, E>) =>
  clientErrorMessage(Option.getOrUndefined(AsyncResult.error(state)))

export function LoadingRows() {
  return (
    <div className="loading-rows" aria-live="polite" aria-label="Loading files">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row}>
          <span />
          <div>
            <i />
            <i />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Notice({
  title,
  children,
  retry,
}: {
  title: string
  children?: React.ReactNode
  retry?: () => void
}) {
  return (
    <div className="workspace-notice" aria-live="polite">
      <FileQuestion size={28} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {retry && (
        <Button variant="outline" onClick={retry}>
          <RefreshCw size={14} />
          Try again
        </Button>
      )}
    </div>
  )
}

const zoomAtom = Atom.family((_key: string) => Atom.make(1))
const sheetAtom = Atom.family((_key: string) => Atom.make(0))

export function DocumentPreview({
  details,
  version,
}: {
  details: FileDetails
  version: FileVersion
}) {
  const key = `${details.file.id}:${version.id}`
  const state = useAtomValue(previewInfo(versionUrl(details.file.id, version.id, "preview")))
  const retry = useAtomRefresh(previewInfo(versionUrl(details.file.id, version.id, "preview")))
  const [zoom, setZoom] = useAtom(zoomAtom(key))
  const [sheet, setSheet] = useAtom(sheetAtom(key))
  const preview = valueOf(state)
  const download = versionUrl(details.file.id, version.id, "download")
  if (!preview) {
    return AsyncResult.isFailure(state) ? (
      <Notice title="Preview could not be opened" retry={retry}>
        {errorOf(state)}
      </Notice>
    ) : (
      <div className="preview-preparing" aria-live="polite">
        <div className="paper-skeleton">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p>Preparing this document…</p>
        <span>Large Office files may take a moment.</span>
      </div>
    )
  }
  if (preview.kind === "unsupported" || preview.kind === "failed") {
    return (
      <Notice
        title={
          preview.kind === "unsupported"
            ? "This file has no preview yet"
            : "This preview could not be prepared"
        }
        retry={preview.kind === "failed" ? retry : undefined}
      >
        {preview.message ?? "You can still download and open the original file."}
        <a className="notice-download" href={download}>
          <Download size={14} /> Download original
        </a>
      </Notice>
    )
  }
  const url = versionUrl(details.file.id, version.id, "content")
  const activeSheet = preview.sheets?.[sheet] ?? preview.sheets?.[0]
  return (
    <div className="document-view">
      <div className="preview-toolbar">
        <span>
          {preview.kind === "pdf"
            ? "Document preview"
            : preview.kind === "image"
              ? "Photo preview"
              : preview.kind === "spreadsheet"
                ? "Workbook preview"
                : "Text preview"}
        </span>
        <div>
          {preview.kind === "image" && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                disabled={zoom <= 0.5}
                onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
              >
                <ZoomOut />
              </Button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                disabled={zoom >= 3}
                onClick={() => setZoom(Math.min(3, zoom + 0.25))}
              >
                <ZoomIn />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
                Fit
              </Button>
            </>
          )}
          {(preview.kind === "pdf" || preview.kind === "image") && (
            <a href={url} target="_blank" rel="noreferrer" className="preview-open">
              Open preview ↗
            </a>
          )}
        </div>
      </div>
      {preview.message && <p className="preview-warning">{preview.message}</p>}
      {preview.truncated && (
        <p className="preview-warning">
          This is a shortened preview. Download the original for the complete file.
        </p>
      )}
      {preview.kind === "pdf" && (
        <iframe
          className="pdf-preview"
          src={url}
          title={`Preview of ${details.file.name}, version ${version.number}`}
        />
      )}
      {preview.kind === "image" && (
        <div className="image-preview">
          <img
            src={url}
            alt={details.file.name}
            style={{
              width: `${zoom * 100}%`,
              maxWidth: zoom === 1 ? "100%" : "none",
              maxHeight: zoom === 1 ? "100%" : "none",
            }}
          />
        </div>
      )}
      {preview.kind === "text" && (
        <div className="text-preview">
          <pre>{preview.text || "This file contains no readable text."}</pre>
        </div>
      )}
      {preview.kind === "spreadsheet" && (
        <div className="spreadsheet-preview">
          <div className="sheet-tabs" aria-label="Workbook sheets">
            {preview.sheets?.map((item, index) => (
              <button
                key={`${index}:${item.name}`}
                aria-pressed={index === sheet}
                onClick={() => setSheet(index)}
              >
                {item.name}
              </button>
            ))}
          </div>
          {activeSheet ? (
            <div className="sheet-scroll">
              <table>
                <caption className="sr-only">{activeSheet.name}</caption>
                <tbody>
                  {activeSheet.rows.map((row, index) => (
                    <tr key={index}>
                      <th scope="row">{index + 1}</th>
                      {row.map((cell, column) => (
                        <td key={column}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Notice title="This workbook has no readable cells" />
          )}
        </div>
      )}
    </div>
  )
}

export function ReviewPanel({
  details,
  version,
  search,
}: {
  details: FileDetails
  version: FileVersion
  search: WorkspaceSearch
}) {
  const key = `${details.file.id}:${version.id}`
  useAtomMount(loadReviewDraft(key))
  const draft = useAtomValue(reviewDraft(key))
  const edit = useAtomSet(editReviewDraft(key))
  const command = useAtomValue(addReviewComment(key))
  const send = useAtomSet(addReviewComment(key))
  const comments = details.comments.filter((comment) => comment.versionId === version.id)
  return (
    <div className="review-panel">
      <div className="review-summary">
        <h2>Review</h2>
        <span>
          {comments.length} {comments.length === 1 ? "comment" : "comments"} · Version{" "}
          {version.number}
        </span>
      </div>
      <div className="comment-list" aria-live="polite">
        {comments.length === 0 ? (
          <div className="comments-empty">
            <MessageSquare size={24} />
            <h3>Start with a detail.</h3>
            <p>Leave a note about this version. Comments stay with the source you reviewed.</p>
          </div>
        ) : (
          comments.map((comment) => (
            <article className="comment" key={comment.id}>
              <header>
                <span className="comment-avatar">HA</span>
                <div>
                  <strong>{comment.author}</strong>
                  <time dateTime={new Date(comment.createdAt).toISOString()}>
                    {formatDate(comment.createdAt)}
                  </time>
                </div>
              </header>
              <p>{comment.body}</p>
            </article>
          ))
        )}
      </div>
      {version.id !== details.file.currentVersionId && (
        <div className="review-version-note">
          You are reviewing an earlier version. Your comment will stay attached to version{" "}
          {version.number}.
        </div>
      )}
      <form
        className="comment-composer"
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft.body.trim() || command.waiting || !draft.loaded || draft.saving) return
          send({
            fileId: details.file.id,
            versionId: version.id,
            draft: { schemaVersion: 1, body: draft.body, idempotencyKey: draft.idempotencyKey },
          })
        }}
      >
        <label htmlFor={`review-${version.id}`} className="sr-only">
          Comment on version {version.number}
        </label>
        <textarea
          id={`review-${version.id}`}
          value={draft.body}
          onChange={(event) => edit(event.target.value)}
          disabled={!draft.loaded || command.waiting}
          placeholder={draft.loaded ? "Leave a comment on this version…" : "Restoring your draft…"}
          maxLength={4000}
          rows={4}
        />
        <div className="composer-footer">
          <span aria-live="polite">
            {draft.saving ? (
              "Saving draft…"
            ) : draft.error ? (
              "Draft not saved"
            ) : draft.saved && draft.body ? (
              <>
                <Check size={12} /> Draft saved
              </>
            ) : (
              "Versioned comment"
            )}
          </span>
          <Button
            type="submit"
            size="icon"
            aria-label="Post comment"
            disabled={!draft.loaded || !draft.body.trim() || draft.saving || command.waiting}
          >
            <Send size={15} />
          </Button>
        </div>
      </form>
      {(draft.error || AsyncResult.isFailure(command)) && (
        <p className="inline-error" role="alert">
          {draft.error ?? errorOf(command)}
        </p>
      )}
      {AsyncResult.isSuccess(command) && (
        <output className="comment-acknowledgement">
          <Check size={13} /> Comment saved to this version
        </output>
      )}
      <RevisionPanel details={details} version={version} search={search} />
    </div>
  )
}

export function ContextPanel({
  details,
  version,
  companyName,
  projectName,
}: {
  details: FileDetails
  version: FileVersion
  companyName?: string
  projectName?: string
}) {
  const state = useAtomValue(fileContext(versionUrl(details.file.id, version.id, "context")))
  const retry = useAtomRefresh(fileContext(versionUrl(details.file.id, version.id, "context")))
  const context = valueOf(state)
  return (
    <div className="file-context">
      <div className="context-intro">
        <ShieldCheck size={21} />
        <h2>Source context</h2>
        <p>Keep the facts close to the file.</p>
      </div>
      <dl className="metadata-list">
        <div>
          <dt>Company</dt>
          <dd>{companyName ?? "Not assigned"}</dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd>{projectName ?? "Not assigned"}</dd>
        </div>
        <div>
          <dt>Collection</dt>
          <dd>{details.file.sourceLabel}</dd>
        </div>
        <div>
          <dt>File type</dt>
          <dd>{details.file.extension.toUpperCase() || "File"}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{formatDate(version.modifiedAt)}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatSize(version.size)}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>Version {version.number}</dd>
        </div>
      </dl>
      <p className="context-inference">
        Company and project groupings come from the copied folder structure. Treat them as context
        to verify.
      </p>
      <section className="source-excerpt">
        <h3>{context?.source === "folder" ? "Folder context" : "From this document"}</h3>
        {context ? (
          <>
            <pre>{context.text || "No readable text was found in this file."}</pre>
            {context.truncated && <p className="context-inference">This excerpt is shortened.</p>}
            {context.notes.map((note, index) => (
              <p key={index} className="context-inference">
                {note}
              </p>
            ))}
          </>
        ) : AsyncResult.isFailure(state) ? (
          <>
            <p>{errorOf(state)}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry context
            </Button>
          </>
        ) : (
          <output>Reading the source context…</output>
        )}
      </section>
    </div>
  )
}
