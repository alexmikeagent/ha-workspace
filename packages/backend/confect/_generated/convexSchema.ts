import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import comments from "./tables/comments";
import companies from "./tables/companies";
import files from "./tables/files";
import jobs from "./tables/jobs";
import projects from "./tables/projects";
import versions from "./tables/versions";

export default $defineSchema({
  comments: $Table.tableDefinition(comments),
  companies: $Table.tableDefinition(companies),
  files: $Table.tableDefinition(files),
  jobs: $Table.tableDefinition(jobs),
  projects: $Table.tableDefinition(projects),
  versions: $Table.tableDefinition(versions),
});
