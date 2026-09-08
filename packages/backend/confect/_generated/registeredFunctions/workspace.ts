import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import workspace from "../../workspace.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../workspace.spec")["default"]>(databaseSchema, workspace, RegisteredConvexFunction.make);
