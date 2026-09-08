import type { AuthConfig } from "convex/server"
import { Config, ConfigProvider, Effect } from "effect"

// This deployment boundary receives only public verification settings from Doppler.
const publicConfig = Effect.runSync(
  Config.all({
    audience: Config.nonEmptyString("AUTH_AUDIENCE"),
    issuer: Config.nonEmptyString("AUTH_ISSUER"),
    jwks: Config.nonEmptyString("AUTH_JWKS"),
  }).pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        AUTH_AUDIENCE: process.env.AUTH_AUDIENCE,
        AUTH_ISSUER: process.env.AUTH_ISSUER,
        AUTH_JWKS: process.env.AUTH_JWKS,
      }),
    ),
  ),
)
export default {
  providers: [
    {
      type: "customJwt",
      applicationID: publicConfig.audience,
      issuer: publicConfig.issuer,
      jwks: publicConfig.jwks,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig
