import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useAtom } from "@effect/atom-react"
import {
  inspectorWidthAtom,
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
} from "./state"
import { clampPanelWidth, panelKeyboardWidth, usePanelResize } from "./use-panel-resize"

const MAIN_MIN_WIDTH = 360
const MOBILE_BREAKPOINT = 760

export function inspectorWidthLimit(containerWidth: number) {
  return Math.max(
    INSPECTOR_MIN_WIDTH,
    Math.min(INSPECTOR_MAX_WIDTH, containerWidth - MAIN_MIN_WIDTH),
  )
}

export function boundedInspectorWidth(width: number, maximum = INSPECTOR_MAX_WIDTH) {
  return clampPanelWidth(width, INSPECTOR_MIN_WIDTH, maximum, INSPECTOR_DEFAULT_WIDTH)
}

export function inspectorKeyboardWidth(key: string, width: number, maximum: number, shift = false) {
  return panelKeyboardWidth(key, width, INSPECTOR_MIN_WIDTH, maximum, "right", shift)
}

export function ResizableInspector({
  children,
  className,
  label,
}: {
  readonly children: ReactNode
  readonly className?: string
  readonly label: string
}) {
  const [preferredWidth, setPreferredWidth] = useAtom(inspectorWidthAtom)
  const [maximum, setMaximum] = useState(INSPECTOR_MAX_WIDTH)
  const [resizable, setResizable] = useState(false)
  const aside = useRef<HTMLElement>(null)
  const id = useId()
  const instructionsId = useId()
  const resize = usePanelResize({
    preferredWidth,
    onCommit: setPreferredWidth,
    minimum: INSPECTOR_MIN_WIDTH,
    maximum,
    fallback: INSPECTOR_DEFAULT_WIDTH,
    side: "right",
    enabled: resizable,
  })

  useEffect(() => {
    const container = aside.current?.parentElement
    if (!container) return
    const measure = () => {
      setMaximum(inspectorWidthLimit(container.clientWidth))
      setResizable(window.innerWidth > MOBILE_BREAKPOINT)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  return (
    <aside
      id={id}
      ref={aside}
      className={`workspace-inspector resizable-inspector ${className ?? ""}`}
      aria-label={label}
      data-resizing={resize.dragging || undefined}
      style={{ "--inspector-width": `${resize.width}px` } as CSSProperties}
    >
      {resizable && (
        <>
          <div
            className="inspector-resize-handle"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- This focusable separator is a resize widget, not a thematic break.
            role="separator"
            tabIndex={0}
            aria-label={`Resize ${label.toLowerCase()}`}
            aria-orientation="vertical"
            aria-controls={id}
            aria-describedby={instructionsId}
            aria-valuemin={INSPECTOR_MIN_WIDTH}
            aria-valuemax={maximum}
            aria-valuenow={resize.width}
            aria-valuetext={`${resize.width} pixels`}
            data-resizing={resize.dragging || undefined}
            {...resize.handleProps}
          />
          <span id={instructionsId} className="sr-only">
            Use Left and Right arrows to resize. Home sets the minimum width; End sets the maximum.
          </span>
        </>
      )}
      <div className="inspector-content">{children}</div>
      {resize.dragging &&
        createPortal(<div className="inspector-resize-shield" aria-hidden="true" />, document.body)}
    </aside>
  )
}
