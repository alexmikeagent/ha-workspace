// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { sanitizeAgentHtml } from "./html-preview"

const pixel = "data:image/png;base64,iVBORw0KGgo="
const read = (source: string) =>
  new DOMParser().parseFromString(sanitizeAgentHtml(source), "text/html")

function expectInactive(document: Document) {
  expect(
    document.querySelector("script,iframe,frame,object,embed,form,input,button,svg,math,link,base"),
  ).toBeNull()
  for (const element of document.querySelectorAll("*")) {
    for (const attribute of element.attributes) {
      expect(attribute.name).not.toMatch(/^on/i)
      expect([
        "href",
        "xlink:href",
        "srcset",
        "poster",
        "srcdoc",
        "action",
        "formaction",
        "target",
        "ping",
        "download",
        "background",
      ]).not.toContain(attribute.name)
      if (attribute.name === "src") {
        expect(element.tagName).toBe("IMG")
        expect(attribute.value).toMatch(/^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,/)
      }
    }
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("agent HTML preview isolation", () => {
  it("preserves static report layout, inline CSS, data images, and embedded font CSS", () => {
    const document = read(`<!doctype html><html><head><style>
      @font-face { font-family: Embedded; src: url(data:font/woff2;base64,AA==); }
      .report { display: grid; grid-template-columns: 1fr 1fr; }
    </style></head><body><article class="report" style="padding: 24px">
      <h1>Weekly review</h1><table><tr><th>Hours</th><td>8</td></tr></table>
      <img alt="Example logo" src="${pixel}"></article></body></html>`)
    expect(document.querySelector("h1")?.textContent).toBe("Weekly review")
    expect(document.querySelector("td")?.textContent).toBe("8")
    expect(document.querySelector("article")?.getAttribute("style")).toBe("padding: 24px")
    expect(document.querySelector("style")?.textContent).toContain("grid-template-columns: 1fr 1fr")
    expect(document.querySelector("style")?.textContent).toContain("data:font/woff2;base64,AA==")
    expect(document.querySelector("img")?.getAttribute("src")).toBe(pixel)
    expectInactive(document)
  })

  it("removes executable markup, interactive forms, namespaces, and navigation attributes", () => {
    const document = read(`<script>window.__previewExecuted = true</script>
      <p onclick="alert(1)" onpointerenter="fetch('/api/session')">Visible text</p>
      <iframe src="/api/session" srcdoc="<script>alert(1)</script>"></iframe>
      <object data="https://example.invalid/payload"></object><embed src="/payload">
      <form action="https://example.invalid/submit"><input name="secret"><button formaction="/api">Submit</button></form>
      <svg onload="alert(1)"><use href="/sprite.svg#icon"></use></svg>
      <math><mtext>hidden namespace</mtext></math>
      <a href="https://example.invalid" target="_top" ping="/track" download>Read more</a>
      <video poster="/poster"><source src="/movie"><track src="/subtitles"></video>`)
    expectInactive(document)
    expect(document.body.textContent).toContain("Visible text")
    expect(document.querySelector("a")?.textContent).toBe("Read more")
  })

  it.each([
    "https://example.invalid/pixel",
    "//example.invalid/pixel",
    "/api/session",
    "../private",
    "javascript:alert(1)",
    "java&#x73;cript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml,%3Csvg%20onload=alert(1)%3E",
    "blob:https://example.invalid/id",
  ])("removes non-raster or external image source %s", (src) => {
    const document = read(
      `<img src="${src}" srcset="${pixel} 1x, https://example.invalid/2x 2x" onerror="alert(1)">`,
    )
    expect(document.querySelector("img")?.hasAttribute("src")).toBe(false)
    expectInactive(document)
  })

  it("places one restrictive policy before source CSS and drops source policies/refresh/base", () => {
    const document = read(`<html><head>
      <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline'">
      <meta http-equiv="refresh" content="0;url=https://example.invalid">
      <base href="https://example.invalid" target="_top"><link rel="stylesheet" href="/theme.css">
      <style>@import url(https://example.invalid/theme); body { background: url(/api/session); }
      @font-face { font-family: Remote; src: url(https://example.invalid/font); }</style>
      </head><body background="/track">Report</body></html>`)
    const policies = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
    expect(policies).toHaveLength(1)
    expect(document.head.firstElementChild).toBe(policies[0])
    const policy = policies[0]?.getAttribute("content")
    for (const directive of [
      "default-src 'none'",
      "script-src 'none'",
      "style-src 'unsafe-inline'",
      "img-src data:",
      "font-src data:",
      "connect-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ]) {
      expect(policy).toContain(directive)
    }
    expect(policy).not.toContain("https:")
    expect(document.querySelector('meta[http-equiv="refresh"]')).toBeNull()
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe(
      "no-referrer",
    )
    expectInactive(document)
  })

  it.each([
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    "<svg><style><img src=x onerror=alert(1)></style></svg>",
    '<table><tr><td><a href="java&#x09;script:alert(1)">Label</a></table>',
    '<style></style></head><body onload=alert(1)><iframe srcdoc="<script>alert(1)</script>">',
  ])("contains malformed parser/namespace payloads after serialization", (source) => {
    expectInactive(read(source))
  })

  it("does not insert source nodes into the application document", () => {
    const before = document.documentElement.outerHTML
    sanitizeAgentHtml(
      '<img src="https://example.invalid/leak"><style>body{display:none}</style><p>Local preview</p>',
    )
    expect(document.documentElement.outerHTML).toBe(before)
  })

  it("fails closed without a browser and bounds oversized inputs", () => {
    const oversized = sanitizeAgentHtml("<script>payload</script>".repeat(24_000))
    expect(oversized).toContain("too large")
    expect(oversized).not.toContain("payload")
    vi.stubGlobal("window", undefined)
    const server = sanitizeAgentHtml("<script>payload</script>")
    expect(server).toContain("available in the browser")
    expect(server).not.toContain("payload")
  })
})
