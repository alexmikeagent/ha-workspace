import { GroupSpec, Spec } from "@confect/core";
import workspace from "../workspace.spec";

const spec: Spec.Spec<
  | GroupSpec.NamedAt<typeof workspace, "workspace">
> = Spec.make().addAt("workspace", workspace);

export default spec;
