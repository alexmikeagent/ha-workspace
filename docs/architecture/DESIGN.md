# HA Workspace — interface contract

Updated September 8, 2026. HA Workspace uses a neutral dark interface, Geist typography, shadcn components built on Base UI, and Hugeicons. The document remains the main focus. Company/project browsing, file/source metadata, previews, versioned comments, and precise revision requests are connected; the design must make those operations easy to understand.

## Design authority and source scope

This contract adapts Vercel's [design guidance](https://vercel.com/design.md), [dark design guidance](https://vercel.com/design.dark.md), [Geist system](https://vercel.com/geist/introduction), and [web interface guidelines](https://vercel.com/design/guidelines). Both Markdown endpoints returned identical content on September 8, 2026. Their published [CSS foundation](https://vercel.com/geist/vercel-brand.css) supplied the reference token roles and neutral values. This is an HA application adaptation: retain HA identity and application semantics, without Vercel logos, authorship claims, or the report-specific brand shell.

Use one continuous canvas, a clear type hierarchy, and deliberate spacing. Add surfaces where they explain interaction or grouping. Reserve color for focus, an actual state, or a document annotation; pair it with text or another visible cue. Remove decorative gradients, glows, textures, and ornamental shadows. These choices follow the reference's restraint while accommodating a dense document workspace. Existing layout studies describe workflow, not a pixel-matching target.

The original wireframe remains the workflow reference. Codex informed the early toolbars and document focus. T3 Code informs the sidebar behavior below. The current Vercel/Geist adaptation supersedes the earlier sage palette, system-font-only direction, and Lucide/Radix proposal. Historical evidence files remain records of those earlier decisions.

## Palette and semantic roles

The source foundation uses zero-chroma dark neutrals: black for its main surface, `oklch(0.946 0 0)` for primary text, and `oklch(0.706 0 0)` for secondary text. HA uses the following application values, with a little more separation between working surfaces. These are our semantic tokens; the app does not load a parallel `vbg-*` stylesheet.

| Application role                    | Token                                     | Adopted dark value                |
| ----------------------------------- | ----------------------------------------- | --------------------------------- |
| Main canvas                         | `--background`                            | `#000000`                         |
| Sidebar and ordinary surface        | `--sidebar`, `--card`                     | `#0a0a0a`                         |
| Popover                             | `--popover`                               | `#111111`                         |
| Quiet field or grouping             | `--muted`                                 | `#171717`                         |
| Secondary action                    | `--secondary`                             | `#1a1a1a`                         |
| Hover and active row                | `--accent`                                | `#1f1f1f`                         |
| Ordinary divider                    | `--border`                                | `#292929`                         |
| Input / stronger hover border       | `--input`, `--border-hover`               | `#333333` / `#454545`             |
| Primary text and primary button     | `--foreground`, `--primary`               | `#ededed`                         |
| Primary button text                 | `--primary-foreground`                    | `#0a0a0a`                         |
| Secondary / subordinate text        | `--muted-foreground`, `--text-subtle`     | `#a1a1a1` / `#888888`             |
| Keyboard focus                      | `--ring`                                  | `#52a8ff`                         |
| Confirmed success / warning / error | `--success`, `--warning`, `--destructive` | `#3ccf91` / `#f5a623` / `#ff6369` |
| Document paper                      | `--paper`, `--paper-foreground`           | `#ffffff` / `#171717`             |

Selection in navigation is neutral. A primary action uses light text-color fill with dark lettering. Semantic status colors appear only when a confirmed state needs them. The document's own colors remain intact; dark mode changes its surroundings, not the source page. Use `color-scheme: dark` and a matching black browser theme color. A light application theme is future work.

## Typography and component base

Use [Geist Sans and Geist Mono](https://vercel.com/font). The application self-hosts variable fonts through `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`, both pinned at `5.3.0`. Package index stylesheets declare Unicode-range subsets, and the browser loads the required local assets. Font requests stay on the application origin. Sans is the default for body text, navigation, controls, tables, dates, and counts. Mono is reserved for code, paths, and short operational identifiers; it should not turn ordinary descriptions or metrics into terminal output.

Application body text is 14px; secondary labels are 12–13px; page headings are 32px. Explanations use a 1.5 line height. Use regular weight for reading, medium for labels and headings, and tabular numbers for aligned numeric comparisons. Inputs on phone layouts remain at least 16px. Keep long filenames accessible in full through a label or tooltip.

The standalone HTML plan makes no network font requests. It uses a Geist-first local stack and falls back to the system sans/mono fonts when Geist is unavailable. It shares the neutral palette and hierarchy; application screenshots are the authority for exact font rendering.

Use the shadcn `base-nova` configuration in both app and UI package, with neutral colors and CSS variables. Base UI supplies accessible interaction primitives; shadcn supplies editable local component code. Keep the existing monorepo arrangement and Vite+ orchestration. [shadcn Base UI documentation](https://ui.shadcn.com/docs/changelog/2026-01-base-ui), [monorepo configuration](https://ui.shadcn.com/docs/monorepo), [Base UI overview](https://base-ui.com/react/overview/about).

Use `@hugeicons/react` with `@hugeicons/core-free-icons`, behind the shared semantic icon exports in `packages/ui`. Match outline weight and optical alignment across navigation, tools, and file types. Typical glyphs are 16px, with 18px where navigation needs more presence. Icons next to a label are decorative; icon-only buttons need an accessible name. Add a component only when an implemented screen needs it. [Hugeicons React quick start](https://hugeicons.com/docs/integrations/react/quick-start).

## Sidebar and workspace behavior

Follow the [T3 Code application layout](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/AppSidebarLayout.tsx) and [off-canvas sidebar](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/ui/sidebar.tsx). The desktop sidebar fully collapses, while its top-left toggle stays available. A schema-backed Effect Atom preference remembers the open state. Ctrl/Cmd+B toggles outside editable fields. The button exposes its name, expanded state, shortcut hint, and tooltip. Mobile navigation uses an independent Base UI Sheet with focus handling and Escape dismissal.

The desktop sidebar starts at 248px and resizes from 220px to 360px, capped by the available shell width minus 360px. A separate schema-backed Effect Atom preference, `ha-workspace.ui.sidebar-width.v1`, stores its width; collapsing the sidebar preserves that preference. A temporary viewport clamp does not overwrite the saved width. Above 760px, the expanded sidebar exposes a right-edge separator immediately after navigation in keyboard Tab order. ArrowRight widens and ArrowLeft narrows by 16px; Shift uses 32px steps. Home selects 220px and End selects the current maximum. Mobile keeps its independent 280px navigation Sheet.

Navigation and inspector resizing share the same pointer lifecycle: capture the pointer, shield embedded previews while dragging, restore the starting width on Escape or cancellation, and persist once on completion. Direct dragging disables the shell grid transition so the edge follows the pointer. Collapse transitions the layout column over 220ms with `cubic-bezier(0.2, 0.8, 0.2, 1)`; its contents fade over 140ms. The inspector enters over 180ms. Reduced-motion preferences remove these transitions. Hidden navigation is inert, and the main scroll surface stays mounted while the sidebar changes.

Company and project links show real indexed files. Search and filters live in the URL; sort and page state belong to atoms. A file opens its version chooser, original download, and actual preview. Context shows file and source metadata, with folder-based company/project inference labeled. It does not show extracted document text. Backend extraction remains available to document tools and validation. Review holds versioned comments, saved drafts, and the exact-text revision form for supported files. Agent explains the current execution limit without simulated actions.

The header pairs a compact horizontal HA mark with the single-line name HA Workspace; no personal-workspace subtitle is needed. Scrollbars use the same neutral surfaces with a visible thumb and hover treatment. Keep native scrolling and avoid hiding the scroll affordance.

Keep Companies, Reports, Invoices, and Templates in that navigation order. Put the version chooser and file actions in a stable toolbar. Review, Context, and Agent share one inspector instead of opening competing sidebars. Each screen should have one clear primary action; unavailable authoring features should not appear as working buttons.

## Geometry and responsive layout

Use a 4px spacing unit: 4, 8, 12, 16, 24, and 32px cover most relationships. One parent owns each gap. Control radius starts at 6px, ordinary surfaces at 8px; larger radii need a real purpose. Prefer spacing and a fine divider to nested cards. Align text and icons optically on shared baselines.

The desktop toolbar targets 52px, with 32px content gutters where width permits. Compact layouts use 24px gutters and phone layouts 16px. The shared catalog/document inspector starts at 330px. Its persisted Effect Atom preference uses `ha-workspace.ui.inspector-width.v1` in the existing storage runtime. Width is bounded to 280–560px, with the live maximum constrained by the container width minus 360px and a 280px floor. Narrowing the viewport clamps the rendered width without erasing the saved preference.

Above 760px, drag the separator or use ArrowLeft to widen and ArrowRight to narrow by 16px; Shift changes the step to 32px. Home selects 280px and End selects the current maximum. Pointer capture and a temporary shield over embedded previews keep dragging reliable. Escape or pointer cancellation restores the starting width; a completed drag saves once. At 760px and below, the resize handle is absent and the inspector uses the existing full-width mobile layout.

At narrow widths, use a single content column. Navigation moves into its Sheet and document tools reflow without page overflow. Keep grid and flex children at `min-width: 0`; allow long data tables to scroll locally. Use 44px touch targets, safe-area padding, and a visible composer when the software keyboard opens. Never disable zoom or intercept ordinary scrolling. Annotation gestures will require an explicit mode when annotations are implemented.

## Feedback, motion, and accessibility

Every file has a distinct loading, ready, empty, unsupported, and failed state. Show backend-confirmed job status and preserve draft text after failure. A last valid preview or query result may remain visible during refresh, with an honest progress or disconnected label. Do not imply a dispatched mutation was reversed when cancellation is merely requested.

Use CSS and Base UI state attributes for ordinary feedback. Keep transitions interruptible, name the properties being animated, and avoid `transition: all`. Prefer opacity and transforms; the bounded sidebar grid transition is a deliberate layout exception. Motion must not delay commands, move the current document anchor unexpectedly, or animate every newly loaded row. [Base UI animation guidance](https://base-ui.com/react/handbook/animation).

| Interaction                      | Duration  | Behavior                               |
| -------------------------------- | --------- | -------------------------------------- |
| Hover, press, focus              | 100–140ms | Color or opacity feedback              |
| Menu and tooltip                 | 120–160ms | Small entrance with the correct origin |
| Sidebar, inspector, mobile sheet | 180–220ms | Preserve orientation and focus         |
| Save acknowledgement             | 140–180ms | Brief label or icon change             |

Honor `prefers-reduced-motion: reduce`; state, focus, and live feedback must remain complete without animation. Use semantic links for navigation and buttons for actions. Preserve visible, unobscured focus, return it after dialogs close, label controls, and announce meaningful async updates politely. Test the whole keyboard path, not just individual components. These are the adapted interaction requirements from Vercel's [web interface guidelines](https://vercel.com/design/guidelines).

## Effect Atom boundaries

Views read feature atoms and send commands through runtime function atoms. One session registry owns the authenticated Confect client and its live reads. Keep shareable filters in the route URL, persisted panel preferences in their own Atom storage, and review drafts keyed by owner and source version through an Effect storage service. Use React refs for focus and geometry, and keep pure JSX straightforward.

Typed failures must lead to a useful action: restore a connection, open the latest version, correct the request, or retry when safe. Preserve the user's input and version context throughout. State management, theme changes, and panel motion must not create a second query cache or an extra client.

## Verification and future work

The September 8 theme and inspector checks verified loaded Geist fonts, Hugeicons, dark scrollbars, metadata-only Context, and a real PDF during pointer resizing. Keyboard resizing, saved width across reloads and routes, sidebar controls, and Base UI drawer focus/Escape behavior passed. At 900px the inspector clamped to available space; at 390px it became full width without a resize handle or horizontal overflow. The browser reported no console warnings or errors. `SETUP.md` records the measurements. The subsequent left-navigation check passed pointer/keyboard resizing, Escape cancellation, collapse/reopen/reload persistence, mobile handle removal, and independent inspector resizing through the shared hook. Remote iPhone access remains a deployment gate.

Continue checking new screens at desktop, compact desktop, and phone widths. Include font fallback, long filenames, active/hover/focus states, repeated toggles, reduced motion, empty results, failures, and worker-offline behavior. Prior checks established review-draft persistence and real Word/PDF and workbook previews; a new feature needs its own interaction evidence.

Page/cell annotations, full Office authoring, intake, new reports/invoices, the instruction editor, AI execution, and a light theme remain future capabilities. They must preserve version ownership and the original document. The visual plan includes labeled layout studies for some of these ideas; it is not evidence that they are implemented.
