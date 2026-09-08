import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { Config, Effect, Schema } from "effect"

class DeploymentError extends Schema.TaggedError<DeploymentError>()("DeploymentError", {
  message: Schema.String,
}) {}
const cwd = fileURLToPath(new URL("..", import.meta.url))
const run = (args: string[], input?: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, args, {
          cwd,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            PATH: `${cwd}/node_modules/.bin:${cwd}/../../node_modules/.bin:${process.env.PATH}`,
          },
        })
        let output = ""
        child.stdout.on("data", (chunk) => {
          output += chunk.toString()
        })
        child.stderr.on("data", (chunk) => {
          output += chunk.toString()
        })
        child.on("error", () => reject(new Error("Command could not start.")))
        child.on("exit", (code) => {
          if (code === 0) resolve()
          else reject(new Error(input ? "Verification setting sync failed." : output))
        })
        child.stdin.end(input)
      }),
    catch: (cause) =>
      new DeploymentError({
        message: cause instanceof Error ? cause.message : "Deployment failed.",
      }),
  })
const main = Effect.gen(function* () {
  const url = yield* Config.string("CONVEX_SELF_HOSTED_URL")
  if (
    url !== "http://127.0.0.1:3220" ||
    process.env.CONVEX_DEPLOYMENT ||
    process.env.CONVEX_DEPLOY_KEY
  )
    return yield* Effect.fail(
      new DeploymentError({
        message: "Refusing a deployment outside HA's dedicated local backend.",
      }),
    )
  const instance = yield* Effect.tryPromise({
    try: () => fetch(`${url}/instance_name`).then((r) => r.text()),
    catch: () => new DeploymentError({ message: "HA backend is not running." }),
  })
  if (instance !== "ha-workspace-local")
    return yield* Effect.fail(
      new DeploymentError({ message: "The running backend is not HA Workspace." }),
    )
  for (const name of ["AUTH_ISSUER", "AUTH_AUDIENCE", "AUTH_JWKS"]) {
    const value = yield* Config.string(name)
    yield* run(["node_modules/convex/bin/main.js", "env", "set", name], `${value}\n`)
  }
  yield* run(["node_modules/@confect/cli/bin/confect.mjs", "codegen"])
  yield* run(["node_modules/convex/bin/main.js", "deploy", "--yes", "--typecheck", "enable"])
  yield* Effect.log("Deployed HA Workspace schema and functions to its dedicated local backend.")
})
await Effect.runPromise(main)
