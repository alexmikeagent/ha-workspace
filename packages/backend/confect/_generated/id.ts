import { GenericId } from "@confect/core";

export type TableNames = "comments" | "companies" | "files" | "jobs" | "projects" | "versions";

export const Id = <const TableName extends TableNames>(
  tableName: TableName,
) => GenericId.GenericId(tableName);
