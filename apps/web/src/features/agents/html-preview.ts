import createDOMPurify from "dompurify"

const MAX_SOURCE_CHARACTERS = 512 * 1024
const PREVIEW_POLICY = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ")

const forbiddenTags = [
  "script",
  "noscript",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "base",
  "meta",
  "link",
  "form",
  "input",
  "button",
  "select",
  "option",
  "optgroup",
  "textarea",
  "fieldset",
  "keygen",
  "datalist",
  "audio",
  "video",
  "source",
  "track",
  "svg",
  "math",
  "portal",
  "fencedframe",
]
const forbiddenAttributes = [
  "href",
  "xlink:href",
  "srcset",
  "poster",
  "action",
  "formaction",
  "background",
  "codebase",
  "data",
  "manifest",
  "profile",
  "srcdoc",
  "target",
  "ping",
  "download",
  "autofocus",
  "contenteditable",
  "tabindex",
  "is",
]
const rasterDataImage = /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i
const colorSchemes = new Set([
  "normal",
  "light",
  "dark",
  "light dark",
  "dark light",
  "only light",
  "only dark",
])

function previewDocument(body: string, colorScheme?: string) {
  // The policy precedes every source-provided byte. Source meta/link/base elements
  // are removed, so the document cannot replace this policy or navigate on load.
  const appearance = colorScheme ? `<meta name="color-scheme" content="${colorScheme}">` : ""
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${PREVIEW_POLICY}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">${appearance}</head><body>${body}</body></html>`
}

/** Returns srcDoc only. The caller must retain an empty iframe sandbox. */
export function sanitizeAgentHtml(source: string): string {
  if (source.length > MAX_SOURCE_CHARACTERS) {
    return previewDocument(
      "<p>This source is too large for an HTML preview. Open the source view.</p>",
    )
  }
  if (typeof window === "undefined") {
    return previewDocument("<p>The HTML preview is available in the browser.</p>")
  }
  const purify = createDOMPurify(window)
  if (!purify.isSupported) {
    return previewDocument("<p>This browser cannot safely prepare the HTML preview.</p>")
  }
  purify.addHook("uponSanitizeAttribute", (node, attribute) => {
    if (attribute.attrName.startsWith("on")) attribute.keepAttr = false
    if (attribute.attrName === "src") {
      attribute.keepAttr = node.nodeName === "IMG" && rasterDataImage.test(attribute.attrValue)
    }
  })

  // Template contents have no browsing context. Never insert untrusted markup in
  // the application's document, even for an intermediate parsing step.
  const input = window.document.createElement("template")
  input.innerHTML = source
  // Retain only a known appearance value; every source meta element is still
  // removed. The preview owns its viewport, referrer policy, and CSP.
  const appearance = Array.from(input.content.querySelectorAll("meta")).find(
    (meta) =>
      meta.getAttribute("name")?.toLowerCase() === "color-scheme" &&
      !meta.hasAttribute("http-equiv"),
  )
  const requestedScheme = appearance
    ?.getAttribute("content")
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
  const colorScheme =
    requestedScheme && colorSchemes.has(requestedScheme) ? requestedScheme : undefined
  const fragment = purify.sanitize(input.content, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: forbiddenTags,
    FORBID_ATTR: forbiddenAttributes,
    RETURN_DOM_FRAGMENT: true,
  })
  const output = window.document.createElement("template")
  output.content.append(fragment)
  // Inline CSS is retained for layout. CSP denies its external imports, images,
  // and fonts; the caller's sandbox independently blocks scripts and navigation.
  return previewDocument(output.innerHTML, colorScheme)
}
