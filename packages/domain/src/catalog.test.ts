import { expect, it } from "vite-plus/test"

import { isOperationalSyncPath } from "./catalog"

it.each([
  "sync.ffs_lock",
  "Client/Reports/sync.ffs_db",
  "Client/report.docx.FFS_TMP",
  "Client/RecycleBin~1234.ffs_tmp/report.docx",
  String.raw`Client\SYNC.FFS_LOCK\report.docx`,
  "Client/sync.ffs_db.e1cb.ffs_tmp",
  "Client/.ffs_tmp",
])("excludes operational metadata anywhere in %s", (path) => {
  expect(isOperationalSyncPath(path)).toBe(true)
})

it.each([
  "Client/Field Report.docx",
  "Client/sync.ffs_db.docx",
  "Client/report.ffs_tmp.notes",
  "Sync/Backup.ffs_batch",
  "Sync/LastRun.ffs_gui",
  "Client/ffs_tmp/report.docx",
])("retains ordinary documents and sync configuration in %s", (path) => {
  expect(isOperationalSyncPath(path)).toBe(false)
})
