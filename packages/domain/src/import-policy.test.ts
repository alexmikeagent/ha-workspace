import { describe, expect, it } from "vite-plus/test"
import { inferCategory, inferGrouping, isCatalogPath } from "./import-policy"

describe("source folder navigation policy", () => {
  it.each([
    "Client/sync.ffs_lock/Report.docx",
    "Client/update.ffs_tmp/Report.docx",
    "Client/.sync.ffs_db",
    "Client/~$Report.docx",
    "Client/partial.docx.crdownload",
    "Client/temporary.tmp",
    "Client/.private/Report.docx",
  ])("does not catalog operational paths: %s", (path) => expect(isCatalogPath(path)).toBe(false))
  it("keeps reference formats and prioritizes explicit billing/template context", () => {
    expect(isCatalogPath("Client/Report.rtf")).toBe(true)
    expect(isCatalogPath("Client/opaque.lnk")).toBe(true)
    expect(inferCategory("HA inspection/Client/Invoice.docx")).toBe("invoices")
    expect(inferCategory("HA inspection/Client/Prototype 1.docx")).toBe("templates")
    expect(inferCategory("HA inspection/Steel inspection/Project/Structural framing.pdf")).toBe(
      "reference",
    )
    expect(inferCategory("HA inspection/Client/Standards/ASTM E985.pdf")).toBe("reference")
    expect(inferCategory("Work/Reports/Final/2026-09-08.docx")).toBe("reports")
    expect(inferCategory("Work/Reports/README.md")).toBe("reference")
  })
  it("retains address projects, without promoting date or organizational folders", () => {
    expect(
      inferGrouping("HA inspection/Client/123 Main Street/report.docx", ["HA inspection"]),
    ).toEqual({ company: "Client", project: "123 Main Street" })
    for (const folder of ["2026-09-08", "9-8-2026", "Invoice 44", "New folder", "2026"])
      expect(inferGrouping(`HA inspection/Client/${folder}/file.docx`, ["HA inspection"])).toEqual({
        company: "Client",
        project: null,
      })
    expect(inferGrouping("Unknown/Client/Project/file.docx", ["HA inspection"])).toEqual({
      company: null,
      project: null,
    })
  })
})
