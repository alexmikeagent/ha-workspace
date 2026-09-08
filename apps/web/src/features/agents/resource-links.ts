import type { AgentResource } from "@ha/domain/agent-library"

export function linkedAgentResource(
  href: string,
  currentPath: string,
  resources: readonly AgentResource[],
): AgentResource | undefined {
  if (!href || href.startsWith("/") || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href))
    return undefined
  let relative: string
  try {
    relative = decodeURIComponent(href.split(/[?#]/)[0] ?? "")
  } catch {
    return undefined
  }
  if (!relative || relative.includes("\\") || relative.includes("\0") || relative.startsWith("/"))
    return undefined
  const parts = currentPath.split("/").slice(0, -1)
  for (const part of relative.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (parts.length <= 1) return undefined
      parts.pop()
    } else parts.push(part)
  }
  return resources.find((resource) => resource.relativePath === parts.join("/"))
}
