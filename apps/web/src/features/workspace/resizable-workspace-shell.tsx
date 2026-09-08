import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useAtom } from "@effect/atom-react"
import {
  desktopSidebarWidthAtom,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "./state"
import { usePanelResize } from "./use-panel-resize"

export function sidebarWidthLimit(containerWidth: number) {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, containerWidth - 360))
}

export function ResizableWorkspaceShell({
  children,
  className,
  expanded,
}: {
  readonly children: (resizeHandle: ReactNode) => ReactNode
  readonly className: string
  readonly expanded: boolean
}) {
  const [preferredWidth, setPreferredWidth] = useAtom(desktopSidebarWidthAtom)
  const [maximum, setMaximum] = useState(SIDEBAR_MAX_WIDTH)
  const [desktop, setDesktop] = useState(false)
  const shell = useRef<HTMLDivElement>(null)
  const instructionsId = useId()
  const resize = usePanelResize({
    preferredWidth,
    onCommit: setPreferredWidth,
    minimum: SIDEBAR_MIN_WIDTH,
    maximum,
    fallback: SIDEBAR_DEFAULT_WIDTH,
    side: "left",
    enabled: desktop && expanded,
  })

  useEffect(() => {
    const element = shell.current
    if (!element) return
    const measure = () => {
      setMaximum(sidebarWidthLimit(Math.min(window.innerWidth, element.clientWidth)))
      setDesktop(window.innerWidth > 760)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  return (
    <div
      ref={shell}
      className={className}
      data-sidebar={expanded ? "expanded" : "collapsed"}
      data-sidebar-resizing={resize.dragging || undefined}
      style={{ "--sidebar-width": `${resize.width}px` } as CSSProperties}
    >
      {children(
        desktop && expanded && (
          <>
            <div
              className="sidebar-resize-handle"
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- This focusable separator is a resize widget, not a thematic break.
              role="separator"
              tabIndex={0}
              aria-label="Resize navigation sidebar"
              aria-orientation="vertical"
              aria-controls="desktop-navigation"
              aria-describedby={instructionsId}
              aria-valuemin={SIDEBAR_MIN_WIDTH}
              aria-valuemax={maximum}
              aria-valuenow={resize.width}
              aria-valuetext={`${resize.width} pixels`}
              data-resizing={resize.dragging || undefined}
              {...resize.handleProps}
            />
            <span id={instructionsId} className="sr-only">
              Use Right and Left arrows to resize. Home sets the minimum width; End sets the
              maximum.
            </span>
          </>
        ),
      )}
      {resize.dragging &&
        createPortal(<div className="inspector-resize-shield" aria-hidden="true" />, document.body)}
    </div>
  )
}
