import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type CommentsDoc = Document.Document<typeof schemaDefinition, "comments">;
export type CompaniesDoc = Document.Document<typeof schemaDefinition, "companies">;
export type FilesDoc = Document.Document<typeof schemaDefinition, "files">;
export type JobsDoc = Document.Document<typeof schemaDefinition, "jobs">;
export type ProjectsDoc = Document.Document<typeof schemaDefinition, "projects">;
export type VersionsDoc = Document.Document<typeof schemaDefinition, "versions">;

export interface Docs {
  comments: CommentsDoc;
  companies: CompaniesDoc;
  files: FilesDoc;
  jobs: JobsDoc;
  projects: ProjectsDoc;
  versions: VersionsDoc;
}
