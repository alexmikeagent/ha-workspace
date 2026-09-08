import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { RegistryProvider } from "@effect/atom-react"
import appCss from "@workspace/ui/globals.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#000000" },
      { title: import.meta.env.VITE_APP_NAME },
      {
        name: "description",
        content: "A calm workspace for field reports, invoices, and document review.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  notFoundComponent: () => (
    <main className="not-found">
      <h1>This page is not here.</h1>
      <a href="/">Return to your workspace</a>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <RegistryProvider>{children}</RegistryProvider>
        <Scripts />
      </body>
    </html>
  )
}
