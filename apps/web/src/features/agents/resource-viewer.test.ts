import { it } from "@effect/vitest"
import { expect } from "vite-plus/test"
import { Effect } from "effect"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  SourceHighlighter,
  SourceHighlighterLive,
  highlightSource,
  sourceLanguage,
} from "./highlight"
import { MarkdownResourcePreview, SourceLines } from "./resource-viewer"
import { linkedAgentResource } from "./resource-links"

it.effect("highlights every supported source grammar without changing its text", () =>
  Effect.gen(function* () {
    for (const [path, code] of [
      ["SKILL.md", "# Heading\n**Strong** text"],
      ["openai.yaml", 'name: "Example"\nenabled: true'],
      ["policy.json", '{"value": 12, "enabled": true}'],
      ["helper.py", 'def example():\n    return "text"'],
      ["template.html", '<h1 class="title">Hello</h1>'],
      ["helper.js", 'const answer = "hello";'],
      ["helper.ts", 'const answer: string = "hello";'],
      ["template.css", ".title { color: #fafafa; }"],
      ["helper.sh", '#!/bin/sh\necho "hello"'],
    ] as const) {
      const tokens = yield* highlightSource(code, sourceLanguage(path))
      expect(tokens.map((line) => line.map((token) => token.content).join("")).join("\n")).toBe(
        code,
      )
      expect(new Set(tokens.flat().map((token) => token.color)).size).toBeGreaterThan(1)
    }
    expect(sourceLanguage("policy.YML")).toBe("yaml")
    expect(sourceLanguage("notes.txt")).toBe("text")
    expect(sourceLanguage("unrecognized.bin")).toBe("text")
  }).pipe(Effect.provide(SourceHighlighterLive)),
)

it.effect("returns a typed plain-text fallback before tokenizing huge or pathological lines", () =>
  Effect.gen(function* () {
    let calls = 0
    for (const content of [
      "x".repeat(100_001),
      "line\n".repeat(21_000),
      "x".repeat(3_001),
      "x\n".repeat(3_001),
    ]) {
      const error = yield* highlightSource(content, "typescript").pipe(
        Effect.provideService(SourceHighlighter, {
          tokens: () =>
            Effect.sync(() => {
              calls++
              return []
            }),
        }),
        Effect.flip,
      )
      expect(error.code).toBe("TooLarge")
    }
    expect(calls).toBe(0)
    const largeSource = "x\n".repeat(3_001)
    const markup = renderToStaticMarkup(
      createElement(SourceLines, { content: largeSource, label: "Long source" }),
    )
    expect(markup).not.toContain("<span")
    expect(markup).toContain(largeSource)
  }),
)

it.effect("renders source tokens as escaped React text", () =>
  Effect.sync(() => {
    const source = '<img src="https://invalid.example/pixel" onerror="alert(1)">'
    const html = renderToStaticMarkup(
      createElement(SourceLines, {
        content: source,
        label: "Example source",
        tokens: [[{ content: source, color: "#e6edf3" }]],
      }),
    )
    expect(html).toContain("&lt;img")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("dangerouslySetInnerHTML")
  }),
)

it.effect(
  "renders Markdown tables and formatting while removing HTML, images, and external navigation",
  () =>
    Effect.sync(() => {
      const html = renderToStaticMarkup(
        createElement(MarkdownResourcePreview, {
          content: `---\nname: metadata-only\ndescription: Hidden frontmatter\n---\n# Readable title\n\n| Name | Value |\n| --- | --- |\n| Example | **Yes** |\n\n![external](https://invalid.example/pixel)\n\n[external](https://invalid.example/)\n\n[dangerous](javascript:alert(1))\n\n<script>window.bad=true</script>\n<img src=x onerror=alert(1)>`,
        }),
      )
      expect(html).toContain("<h1>Readable title</h1>")
      expect(html).toContain("<table>")
      expect(html).toContain("<strong>Yes</strong>")
      expect(html).not.toContain("metadata-only")
      expect(html).not.toContain("<script")
      expect(html).not.toContain("<img")
      expect(html).not.toContain("href=")
      expect(html).not.toContain("src=")
    }),
)

it.effect("maps relative links only to already-authorized library resources", () =>
  Effect.sync(() => {
    const reference = {
      id: "a".repeat(64),
      name: "Reference",
      kind: "reference" as const,
      relativePath: "HA_Consulting_Work/.agents/skills/example/references/facts and notes.md",
      skillId: "b".repeat(64),
      sizeBytes: 10,
      modifiedAt: 1,
    }
    const current = "HA_Consulting_Work/.agents/skills/example/SKILL.md"
    expect(linkedAgentResource("references/facts%20and%20notes.md", current, [reference])).toBe(
      reference,
    )
    expect(
      linkedAgentResource("./references/facts%20and%20notes.md#heading", current, [reference]),
    ).toBe(reference)
    for (const href of [
      "https://invalid.example/facts.md",
      "javascript:alert(1)",
      "//invalid.example",
      "/etc/passwd",
      "../../../../../secret.md",
      "references/unknown.md",
      "%ZZ",
      "C:\\private\\file.md",
    ]) {
      expect(linkedAgentResource(href, current, [reference])).toBeUndefined()
    }
  }),
)
