import { useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { FileDetails, FileVersion, ReviewJob } from "@ha/domain/workspace"
import { Link } from "@tanstack/react-router"
import { Option } from "effect"
import { AsyncResult } from "effect/unstable/reactivity"
import { ChevronRight, GitBranch } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/button"
import {
  cancelRevision,
  editReviewDraft,
  loadReviewDraft,
  requestRevision,
  readRevisionDraft,
  reviewDraft,
} from "./catalog"
import { clientErrorMessage } from "./browser-services"
import { formatDate, type WorkspaceSearch } from "./state"

const errorOf = <A, E>(state: AsyncResult.AsyncResult<A, E>) =>
  clientErrorMessage(Option.getOrUndefined(AsyncResult.error(state)))

export function RevisionPanel({
  details,
  version,
  search,
}: {
  details: FileDetails
  version: FileVersion
  search: WorkspaceSearch
}) {
  const key = `revision:${details.file.id}:${version.id}`
  useAtomMount(loadReviewDraft(key))
  const draft = useAtomValue(reviewDraft(key))
  const edit = useAtomSet(editReviewDraft(key))
  const command = useAtomValue(requestRevision(key))
  const request = useAtomSet(requestRevision(key))
  const values = Option.getOrElse(readRevisionDraft(draft.body), () => ({
    find: "",
    replacement: "",
  }))
  const supported = /^(docx|txt|md)$/i.test(details.file.extension.replace(/^\./, ""))
  const pendingJob = details.jobs.some((job) => job.status === "queued" || job.status === "running")
  const isCurrent = version.id === details.file.currentVersionId
  const blocked = !draft.loaded || draft.saving || command.waiting || pendingJob || !isCurrent
  const jobs = details.jobs.filter((job) => job.baseVersionId === version.id).slice(0, 6)
  return (
    <section className="revision-section">
      {supported && (
        <details>
          <summary>
            <GitBranch size={15} />
            <span>Revise this document</span>
            <ChevronRight size={14} />
          </summary>
          <p>
            Replace one exact text match and create a new version. The source file stays intact.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (blocked || !values.find || values.find === values.replacement) return
              request({
                fileId: details.file.id,
                versionId: version.id,
                draft: { schemaVersion: 1, body: draft.body, idempotencyKey: draft.idempotencyKey },
              })
            }}
          >
            <label>
              Find exact text
              <textarea
                value={values.find}
                rows={2}
                maxLength={4000}
                disabled={!draft.loaded || command.waiting || pendingJob}
                onChange={(event) => edit(JSON.stringify({ ...values, find: event.target.value }))}
                placeholder="Text as it appears in this document"
              />
            </label>
            <label>
              Replace with
              <textarea
                value={values.replacement}
                rows={2}
                maxLength={4000}
                disabled={!draft.loaded || command.waiting || pendingJob}
                onChange={(event) =>
                  edit(JSON.stringify({ ...values, replacement: event.target.value }))
                }
                placeholder="Corrected text, or leave blank to remove"
              />
            </label>
            {!isCurrent && (
              <p className="review-version-note">
                Choose the current version before requesting a change. This draft stays with version{" "}
                {version.number}.
              </p>
            )}
            <div className="revision-actions">
              <span>
                {draft.saving
                  ? "Saving draft…"
                  : draft.error
                    ? "Draft not saved"
                    : draft.body
                      ? "Draft saved"
                      : "Exact match only"}
              </span>
              <Button
                type="submit"
                disabled={blocked || !values.find || values.find === values.replacement}
              >
                {command.waiting
                  ? "Requesting…"
                  : pendingJob
                    ? "Revision in progress"
                    : "Create revision"}
              </Button>
            </div>
            {(draft.error || AsyncResult.isFailure(command)) && (
              <p className="inline-error" role="alert">
                {draft.error ?? errorOf(command)}
              </p>
            )}
            {AsyncResult.isSuccess(command) && (
              <p className="revision-request-ack" aria-live="polite">
                Revision requested. Its progress appears below.
              </p>
            )}
          </form>
        </details>
      )}
      {jobs.length > 0 && (
        <div className="revision-jobs" aria-live="polite">
          <h3>Revision activity</h3>
          {jobs.map((job) => (
            <RevisionJobRow key={job.id} job={job} search={search} />
          ))}
        </div>
      )}
    </section>
  )
}

function RevisionJobRow({ job, search }: { job: ReviewJob; search: WorkspaceSearch }) {
  const cancel = useAtomSet(cancelRevision(job.id))
  const command = useAtomValue(cancelRevision(job.id))
  return (
    <article className={`revision-job ${job.status}`}>
      <div>
        <span className="job-status">{job.status[0].toUpperCase() + job.status.slice(1)}</span>
        <time dateTime={new Date(job.updatedAt).toISOString()}>{formatDate(job.updatedAt)}</time>
      </div>
      <p>{job.message}</p>
      {job.resultVersionId && (
        <Link to="/" search={{ ...search, version: job.resultVersionId }}>
          Open new version <ChevronRight size={12} />
        </Link>
      )}
      {(job.status === "queued" || job.status === "running") && (
        <Button
          size="sm"
          variant="outline"
          disabled={command.waiting}
          onClick={() => cancel(undefined)}
        >
          {command.waiting ? "Cancelling…" : "Cancel revision"}
        </Button>
      )}
      {AsyncResult.isFailure(command) && (
        <p className="inline-error" role="alert">
          {errorOf(command)}
        </p>
      )}
    </article>
  )
}
