import { Config, Context, Effect, Layer, Redacted, Schema } from "effect"
import { importJWK, jwtVerify, SignJWT } from "jose"

export class SessionError extends Schema.TaggedError<SessionError>()("SessionError", {
  message: Schema.String,
}) {}

const SigningJwk = Schema.Struct({
  kty: Schema.Literal("RSA"),
  n: Schema.String,
  e: Schema.String,
  d: Schema.String,
  p: Schema.String,
  q: Schema.String,
  dp: Schema.String,
  dq: Schema.String,
  qi: Schema.String,
  kid: Schema.String,
})

export const LocalIdentity = Schema.Struct({
  sub: Schema.String,
  sessionId: Schema.String,
  role: Schema.Literals(["owner", "importer"]),
  workspaceId: Schema.Literal("ha-workspace"),
})
export type LocalIdentity = typeof LocalIdentity.Type

export class LocalAuth extends Context.Service<
  LocalAuth,
  {
    readonly issue: (identity: LocalIdentity) => Effect.Effect<string, SessionError>
    readonly verify: (token: string) => Effect.Effect<LocalIdentity, SessionError>
  }
>()("ha/auth/LocalAuth") {}

export const LocalAuthLive = Layer.effect(
  LocalAuth,
  Effect.gen(function* () {
    const raw = yield* Config.redacted("AUTH_PRIVATE_JWK")
    const issuer = yield* Config.nonEmptyString("AUTH_ISSUER")
    const audience = yield* Config.nonEmptyString("AUTH_AUDIENCE")
    const json = yield* Effect.try({
      try: () => JSON.parse(Redacted.value(raw)) as unknown,
      catch: () => new SessionError({ message: "Signing configuration is invalid." }),
    })
    const jwk = yield* Schema.decodeUnknownEffect(SigningJwk)(json).pipe(
      Effect.mapError(() => new SessionError({ message: "Signing configuration is invalid." })),
    )
    const key = yield* Effect.tryPromise({
      try: () => importJWK(jwk, "RS256"),
      catch: () => new SessionError({ message: "Signing key could not be loaded." }),
    })
    const publicKey = yield* Effect.tryPromise({
      try: () => importJWK({ kty: jwk.kty, n: jwk.n, e: jwk.e }, "RS256"),
      catch: () => new SessionError({ message: "Verification key could not be loaded." }),
    })
    return LocalAuth.of({
      issue: (identity) =>
        Effect.tryPromise({
          try: () =>
            new SignJWT(identity)
              .setProtectedHeader({ alg: "RS256", kid: jwk.kid, typ: "JWT" })
              .setIssuer(issuer)
              .setAudience(audience)
              .setIssuedAt()
              .setExpirationTime("8h")
              .sign(key),
          catch: () => new SessionError({ message: "A local session could not be issued." }),
        }),
      verify: (token) =>
        Effect.tryPromise({
          try: () => jwtVerify(token, publicKey, { issuer, audience, algorithms: ["RS256"] }),
          catch: () => new SessionError({ message: "The local session has expired." }),
        }).pipe(
          Effect.flatMap(({ payload }) => Schema.decodeUnknownEffect(LocalIdentity)(payload)),
          Effect.mapError(() => new SessionError({ message: "The local session is invalid." })),
        ),
    })
  }),
)
