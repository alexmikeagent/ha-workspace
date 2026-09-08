import { WebSocketClient } from "@confect/js"
import { Context, Effect, Layer } from "effect"

// Registration is not an auth-confirmation promise. Gate private atoms on onAuthChange.
export const sessionClientLayer = (
  address: string,
  fetchToken: (args: { forceRefreshToken: boolean }) => Effect.Effect<string | null | undefined>,
  onAuthChange: (authenticated: boolean) => Effect.Effect<void>,
) =>
  WebSocketClient.layer(address).pipe(
    Layer.tap((context) =>
      Context.get(context, WebSocketClient.WebSocketClient).setAuth(fetchToken, onAuthChange),
    ),
  )
