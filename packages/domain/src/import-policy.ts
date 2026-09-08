import { isOperationalSyncPath } from "./catalog"

const visibleExtensions = new Set([
  "pdf",
  "docx",
  "doc",
  "rtf",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "csv",
  "md",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "heic",
  "lnk",
  "gdoc",
  "gsheet",
])

export function isCatalogPath(relative: string): boolean {
  const parts = relative.split(/[\\/]+/)
  return (
    !isOperationalSyncPath(relative) &&
    !parts.some(
      (part) =>
        part.startsWith(".") ||
        part.startsWith("~$") ||
        part === "tools" ||
        part === "node_modules" ||
        part === "90 - QA Artifacts",
    ) &&
    visibleExtensions.has((parts.at(-1)?.split(".").at(-1) ?? "").toLowerCase())
  )
}

export function inferCategory(
  relative: string,
): "reports" | "invoices" | "contracts" | "templates" | "reference" {
  const parts = relative.toLowerCase().split(/[\\/]+/)
  const name = parts.at(-1) ?? ""
  const folders = parts.slice(0, -1)
  if (/template|tamplet|sample|prototype|blank/.test(name)) return "templates"
  if (/invoice|billing/.test(name)) return "invoices"
  if (/contract|agreement|proposal/.test(name)) return "contracts"
  if (
    /report|inspection|observation|dfr|non.?compliance/.test(name) &&
    /\.(pdf|docx?|xlsx?|txt|md)$/i.test(name)
  )
    return "reports"
  // A source collection or company containing "inspection" does not make every
  // drawing, standard, or reference document a report.
  if (
    folders.some((folder) => /^(?:daily |field |daily field )?reports?$/.test(folder)) &&
    !/\.(md|txt)$/.test(name)
  )
    return "reports"
  if (folders.some((folder) => /^invoices?(?:\s+\d+)?$/.test(folder))) return "invoices"
  if (folders.some((folder) => /^(?:\d+ - )?templates?$/.test(folder))) return "templates"
  if (folders.some((folder) => /^(?:\d+ - )?contracts?$/.test(folder))) return "contracts"
  return "reference"
}

// Directory labels are navigation hints. They are not verified company identities or visit dates.
export function inferGrouping(relative: string, companyRoots: ReadonlyArray<string>) {
  const root = companyRoots.find((candidate) => relative.startsWith(`${candidate}/`))
  if (!root) return { company: null, project: null }
  const parts = relative.slice(root.length + 1).split("/")
  if (parts.length < 2) return { company: null, project: null }
  const company = parts[0] ?? null
  const candidate = parts.length > 2 ? parts[1] : null
  const project =
    candidate &&
    !/^(invoice|report|photo|picture|template|bol|new folder|correction|draft|final|source)/i.test(
      candidate,
    ) &&
    !/^(?:\d{4}|\d+|\d{1,2}[-_.]\d{1,2}(?:[-_.]\d{2,4})?|\d{4}[-_.]\d{1,2}[-_.]\d{1,2})$/.test(
      candidate,
    )
      ? candidate
      : null
  return { company, project }
}
