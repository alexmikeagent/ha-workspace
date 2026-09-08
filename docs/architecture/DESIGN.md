# HA Workspace — interface contract

Interface direction updated September 8, 2026. Build a modern, clear workspace for finding files, reviewing documents, and requesting changes. The wireframe guides the workflow. The finished product should feel deliberate and responsive on desktop and iPhone, with its own visual system and restrained animation.

## Reference and evidence

Use the existing `ha-codex-workroom.html` prototype as the functional reference. Keep its company/file/review journeys, then improve hierarchy, spacing, and interaction as the real document content requires. Codex remains a useful reference for quiet toolbars and document focus. Historical read-only inspection of its installed CSS inside `/usr/lib/chatgpt/resources/app.asar` found these declarations:

| Token                   | Observed declaration                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Sans font               | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`                                 |
| Mono font               | `ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`  |
| Type scale              | 11px, 12px, 14px base, 16px, 28px                                                           |
| Spacing unit            | 4px                                                                                         |
| Sidebar                 | Default preference 275px; clamp starts at 240px and permits up to 520px subject to viewport |
| Toolbar                 | 46px base, 36px small, 40px pane; other selectors override the main toolbar to 52px         |
| Neutral palette entries | White, #f9f9f9, #f3f3f3, #ededed, #303030, #282828, #212121, #181818                        |

These are historical source declarations, not measurements of the active window. They provide context for the initial plan; they are not a pixel-matching target. Use shadcn primitives, semantic tokens, and one coherent icon set. Evaluate the result with real files from the local fake Drive and the acceptance checks below.

## Shell geometry

Desktop: persistent left navigation, central content, and one resizable right inspector. File lists open a dedicated file route with preserved origin/filter state. Avoid squeezing both a review sidebar and a second Agent sidebar beside the preview; the inspector switches between Review, Context, and Agent tabs.

```text
┌──────────────────────┬──────────────────────────────────────────────────┐
│ HA Consulting   [≡]  │ [←][→] Company / File           [↓] [⋯] [Panel] │
│                      ├────────────────────────────────┬─────────────────┤
│ Companies            │ [Version ▾] [Page − +] [Fit]   │ Review Context  │
│ Reports              │                    [Annotate] │ Agent           │
│ Invoices             ├────────────────────────────────┤                 │
│ Templates            │                                │ Comments /      │
│                      │       Document preview         │ source facts /  │
│ Recent files         │                                │ AGENTS + skills │
│ …                    │                                │                 │
│                      │                                │ [composer]      │
│ Profile   [Settings] │                                │ [attach]   [↑]  │
└──────────────────────┴────────────────────────────────┴─────────────────┘
```

Proposed implementation dimensions:

| Element                       | Initial target                                                               |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Navigation sidebar            | 248px starting point; resizable 224–320px                                    |
| Main toolbar                  | 52px desktop; 56px on touch layouts                                          |
| Document toolbar              | 44px desktop                                                                 |
| Right inspector               | 340px default; resizable 300–480px                                           |
| Minimum useful preview column | 480px; collapse inspector into an overlay below the combined panel threshold |
| Page/dashboard gutters        | 32px desktop, 24px compact, 16px phone                                       |
| Navigation rows               | 38px desktop, 44px touch                                                     |
| Regular buttons               | 34px desktop, 44px touch                                                     |
| Icon glyphs                   | 16px primary, 18px for major navigation                                      |
| Button/field radius           | 8px controls, 12px surfaces, 16px composer                                   |

Persist width/collapse/theme preferences separately from document state. Bound widths again after viewport changes. Panel resizing must support keyboard controls.

## Typography, color and components

Use a system sans stack for readable application text and fast first paint. Use system monospace for Markdown source and identifiers. Body text is 14px, metadata 12px, quiet labels 11px, section titles 16px/500, page titles 28px/500. Inputs on iPhone use at least 16px. Use a 1.5 line height for explanatory text and a tighter line height for concise toolbar labels. Keep long filenames readable with a full-name tooltip and accessible label.

Use a 4px spacing grid: 4/8/12/16/24/32. Keep icon-to-label gaps at 8px and align toolbar controls to one baseline. Use medium weight sparingly for selected rows and titles.

| Semantic token     | Light proposal | Dark proposal |
| ------------------ | -------------- | ------------- |
| Main surface       | #ffffff        | #16191b       |
| Sidebar            | #f6f7f5        | #111416       |
| Preview surround   | #eef0ee        | #1c2023       |
| Hover/selected row | #e7ebe6        | #282f31       |
| Primary text       | #202626        | #edf1ed       |
| Secondary text     | #596461        | #aab4af       |
| Divider            | #dce2dd        | #30393a       |

These are proposed product tokens. Verify contrast in the rendered UI. Use a restrained sage accent for selection and the primary action, with a distinct blue for document annotations. Keep warning, danger, and success tokens semantic; status also includes a text label or icon. The document page stays white in dark mode. Avoid turning every panel into an elevated card: use spacing and a fine divider for ordinary grouping, and reserve elevation for overlays.

Start with shadcn Button, Sidebar, Resizable, Tabs, Tooltip, DropdownMenu, Dialog, Sheet, ScrollArea, Separator, Breadcrumb, Input and Textarea. Add only components needed by a screen. Use one Lucide outline icon set with consistent stroke weight; Lucide is the proposed equivalent, not a claim about Codex's internal icon library. Centralize icons through a named map so alignment changes propagate.

## Placement and behavior

| Control                              | Placement and behavior                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Companies/Reports/Invoices/Templates | Left rail in exactly this order, persistent selected state                       |
| New report / New invoice             | Top right of the relevant list heading                                           |
| Upload                               | Company file list heading; company/project context retained                      |
| Back/forward + breadcrumbs           | Left side of top toolbar; restore list filters/scroll on return                  |
| Download / overflow / inspector      | Right side of top toolbar, stable order on every file                            |
| Version + page/slide/sheet + zoom    | Document toolbar; preserve page when compatible                                  |
| Annotate                             | Right side of document toolbar; explicit select mode                             |
| Review / Context / Agent             | Tabs at inspector top; Agent toggle activates the Agent tab                      |
| Change-request composer              | Anchored at inspector bottom; selected annotation shown above text               |
| Attach + Send                        | Bottom left and bottom right inside composer; Send becomes Stop during execution |
| Save draft / Apply instructions      | Agent editor footer, with saved/active/conflict status                           |

Reports opens on recent reports and counts by company with filters; avoid filling the page with generic metric cards. Companies opens its file list; all four categories share the same list row component and file route. Templates display scope and current binding without exposing internal package names.

The Context tab shows the selected template, task operation, company/project, visit facts and their sources, pending questions, and the corrections applied. A correction defaults to the current task; changing a company default is a separate explicit action. Intentional blank fields stay distinct from unanswered required fields.

Annotations support page rectangles and comments, text selection where available, sheet cell/range selection, and whole-file comments. Draft input survives route changes and reconnects. Apply a correction by creating a new source version and rendering it; the preview should never pretend that changing an HTML overlay changed the actual Office file.

## A calmer workflow through progressive disclosure

Show the document and the next useful action first. The file list needs a strong filename, format, modified date, and relevant status; secondary metadata belongs in the inspector. A clear row selection and breadcrumb should explain location without repeating it in several headings. Preserve filters, sort order, scroll position, and preview position when returning from a file.

Keep one primary action per context: New report on Reports, Upload within a company, and Send change request in review. Place uncommon actions in a labeled overflow menu. Never hide an essential action behind hover alone. Use concise, specific copy such as “Preview is being prepared” or “This revision changed. Review the latest version”; preserve the user's draft when an operation fails.

The inspector opens to the relevant tab and remembers its width. Expanding a panel should not move the current document anchor out of view. Details such as source facts, instruction hashes, renderer diagnostics, or adapter status appear when they help resolve a question; package names and runtime mechanics stay out of ordinary product flows.

Use a stable skeleton shaped like the eventual file row or page while data loads. Show the last valid preview during a refresh, with a quiet progress label. A blank file, unsupported format, failed preview, empty folder, and offline worker have distinct states with an appropriate next step. File previews and request status must always describe what the backend has confirmed.

## Motion with a purpose

Motion should explain a state change and preserve orientation. Implement it through shared CSS variables and shadcn/Radix state attributes. Use CSS transitions for ordinary controls and overlays. Add a motion library only if a specific interaction cannot be expressed cleanly with these primitives; document the reason.

| Interaction                   | Proposed duration | Behavior                                                                              |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| Hover, press, focus treatment | 100–140ms         | Color/opacity change; a press may use at most a 1px offset                            |
| Popover, menu, tooltip        | 120–160ms         | Small opacity/transform entrance with the correct transform origin                    |
| Inspector or mobile sheet     | 180–220ms         | Short transform/opacity transition; focus moves after the panel becomes usable        |
| Route/content change          | 160–220ms         | Brief crossfade or at most 8px movement; keep navigation and document controls stable |
| Saved/success acknowledgement | 140–180ms         | Quiet icon or label transition, without blocking the next action                      |

Use `cubic-bezier(0.2, 0.8, 0.2, 1)` for entrances and `ease-out` for simple feedback. Animate transforms and opacity, avoiding repeated layout work across large document surfaces. Resizing follows the pointer immediately and has no smoothing lag. Virtualized lists should not animate every arriving row. Avoid perpetual decorative motion, bouncing panels, parallax, and shimmering loaders.

Honor `prefers-reduced-motion: reduce`: remove travel and spring effects, disable automatic transitions, and apply state changes immediately or with a brief opacity change. Focus visibility, live status messages, and keyboard controls work with animation disabled. Announce meaningful async status with a polite live region; motion or color cannot be the only status signal. Avoid intercepting standard scroll and touch gestures.

Validate rapid repeated toggles, interruption midway through a panel animation, reduced-motion mode, and slower devices. An animation must not delay a command, hide a failure, clear a selection, or steal focus. Measure performance with a real multipage preview open.

## Phone behavior

At narrow widths, switch to a single content surface. Navigation moves into a Sheet, file preview takes the full width, and Review/Context/Agent open as full-height panels or drawers. Preserve the exact navigation names and inspector tabs. Use 44px touch targets and safe-area padding; keep the composer visible with the software keyboard open.

Pinch/scroll remain normal until annotation mode is selected. In annotation mode, a drag creates a box with handles and a clear Done/Cancel action. Do not treat every touch gesture as drawing. Delay heavy viewers until a file is opened; render only nearby pages/slides or visible sheet ranges.

## Visual and interaction acceptance

Review light and dark screenshots at 1440×900, 1024×768, and a representative 390px-wide iPhone viewport. Judge hierarchy, font fallback, icon baseline, density, toolbar order, active/hover/focus states, and panel geometry against this contract. Use long filenames, mixed formats, unavailable previews, and real folder depth from the fake Drive. The wireframe establishes workflow coverage; the product design should improve clarity and comfort as actual content is introduced.

Exercise keyboard navigation, focus restoration, Escape behavior, panel resizing, mobile selection, page zoom and comment positioning. Verify that opening the inspector does not create horizontal overflow, document text stays readable, and the keyboard does not hide Send. Check loading, empty, error, rendering, reconnecting, worker-offline, and instruction-conflict states using real labels.

The shell is part of the foundation work. These remain acceptance requirements until checked in the implemented UI. The local HTML plan is an illustrative document, not evidence that application features are complete.

## Effect Atom state and command boundaries

Keep application behavior out of JSX and event handlers. A view reads feature atoms and sends commands through runtime function atoms. A session-owned Atom registry supplies state and typed command outcomes. One Confect client feeds live reads into atoms through a schema-preserving adapter. Show typed missing-fact, revision-conflict, locked-file, and publication-conflict states with an action the user can take. Preserve draft text when a command fails. Cancellation displays a request until durable job state confirms completion; it does not imply a dispatched mutation was reversed.

Use atoms for the inspector tab, annotation selection, preview zoom, panel preferences, draft editing, and derived submit state. Keep shareable filters in the route URL. Drafts persist through an Effect storage service, keyed by owner and source revision. Render async query/command states explicitly, with draft text and the last valid preview preserved when a refresh fails. Use React refs for focus and geometry.
