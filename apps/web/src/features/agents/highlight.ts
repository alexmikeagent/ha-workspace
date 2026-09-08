import { Context, Effect, Layer, Schema } from "effect"
import { Atom } from "effect/unstable/reactivity"

export type SourceLanguage =
  | "markdown"
  | "yaml"
  | "json"
  | "python"
  | "html"
  | "javascript"
  | "typescript"
  | "css"
  | "shellscript"
  | "text"
export interface SourceToken {
  readonly content: string
  readonly color?: string
  readonly fontStyle?: number
}
export type SourceTokens = readonly (readonly SourceToken[])[]
export class HighlightError extends Schema.TaggedError<HighlightError>()("HighlightError", {
  code: Schema.Literals(["TooLarge", "Unavailable"]),
  message: Schema.String,
}) {}

export function sourceLanguage(path: string): SourceLanguage {
  const extension = path.split(".").at(-1)?.toLowerCase()
  const languages: Record<string, SourceLanguage> = {
    md: "markdown",
    markdown: "markdown",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    py: "python",
    python: "python",
    html: "html",
    htm: "html",
    js: "javascript",
    javascript: "javascript",
    ts: "typescript",
    typescript: "typescript",
    css: "css",
    sh: "shellscript",
    bash: "shellscript",
    shell: "shellscript",
    shellscript: "shellscript",
  }
  return languages[extension ?? ""] ?? "text"
}

export function highlightLimit(content: string) {
  const lines = content.split(/\r?\n/)
  return (
    content.length > 100_000 || lines.length > 3_000 || lines.some((line) => line.length > 3_000)
  )
}

export class SourceHighlighter extends Context.Service<
  SourceHighlighter,
  {
    readonly tokens: (
      content: string,
      language: SourceLanguage,
    ) => Effect.Effect<SourceTokens, HighlightError>
  }
>()("ha/agents/SourceHighlighter") {}

const unavailable = () =>
  new HighlightError({
    code: "Unavailable",
    message: "Syntax colors are unavailable. The source is shown below.",
  })
export const SourceHighlighterLive = Layer.effect(
  SourceHighlighter,
  Effect.gen(function* () {
    const highlighter = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => import("./shiki-runtime"), catch: unavailable }).pipe(
        Effect.flatMap((module) =>
          Effect.try({ try: module.createSourceHighlighter, catch: unavailable }),
        ),
      ),
      (instance) => Effect.sync(() => instance.dispose()),
    )
    return {
      tokens: (content, language) =>
        Effect.try({
          try: () =>
            highlighter.codeToTokens(content, { lang: language, theme: "github-dark-default" })
              .tokens,
          catch: unavailable,
        }),
    }
  }),
)

export const highlightSource = Effect.fn("agents.highlightSource")(function* (
  content: string,
  language: SourceLanguage,
) {
  if (highlightLimit(content))
    return yield* new HighlightError({
      code: "TooLarge",
      message: "Shown as plain text to keep this file responsive.",
    })
  return yield* (yield* SourceHighlighter).tokens(content, language)
})

// The expensive grammar instance is lazy and shared only within this session's
// registry. Its layer releases Shiki when the registry is disposed.
export const highlightRuntime = Atom.runtime(SourceHighlighterLive).pipe(Atom.keepAlive)
