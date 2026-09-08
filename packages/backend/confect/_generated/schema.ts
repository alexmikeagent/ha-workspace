import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import comments from "./tables/comments";
import companies from "./tables/companies";
import files from "./tables/files";
import jobs from "./tables/jobs";
import projects from "./tables/projects";
import versions from "./tables/versions";

const databaseSchema: $DatabaseSchema.DatabaseSchema<
  typeof comments |
  typeof companies |
  typeof files |
  typeof jobs |
  typeof projects |
  typeof versions
> = $DatabaseSchema.make({
  comments,
  companies,
  files,
  jobs,
  projects,
  versions,
});

export default databaseSchema;
