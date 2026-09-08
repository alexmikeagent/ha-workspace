import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useAtom } from "@effect/atom-react"
import {
  inspectorWidthAtom,
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
} from "./state"

const MAIN_MIN_WIDTH = 360
const MOBILE_BREAKPOINT = 760

export function inspectorWidthLimit(containerWidth: number) {
  return Math.max(
    INSPECTOR_MIN_WIDTH,
    Math.min(INSPECTOR_MAX_WIDTH, containerWidth - MAIN_MIN_WIDTH),
  )
}

export function boundedInspectorWidth(width: number, maximum = INSPECTOR_MAX_WIDTH) {
  const safeWidth = Number.isFinite(width) ? width : INSPECTOR_DEFAULT_WIDTH
  return Math.round(Math.max(INSPECTOR_MIN_WIDTH, Math.min(maximum, safeWidth)))
}

export function inspectorKeyboardWidth(key: string, width: number, maximum: number, shift = false) {
  const step = shift ? 32 : 16
  switch (key) {
    case "ArrowLeft":
      return boundedInspectorWidth(width + step, maximum)
    case "ArrowRight":
      return boundedInspectorWidth(width - step, maximum)
    case "Home":
      return INSPECTOR_MIN_WIDTH
    case "End":
      return maximum
    default:
      return undefined
  }
}

interface Drag {
  readonly pointerId: number
  readonly startX: number
  readonly startWidth: number
  readonly handle: HTMLDivElement
}

function releaseDrag(drag: Drag | null) {
  if (drag?.handle.hasPointerCapture(drag.pointerId)) {
    drag.handle.releasePointerCapture(drag.pointerId)
  }
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
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const aside = useRef<HTMLElement>(null)
  const drag = useRef<Drag | null>(null)
  const id = useId()
  const instructionsId = useId()
  const width = boundedInspectorWidth(dragWidth ?? preferredWidth, maximum)

  useEffect(() => {
    const container = aside.current?.parentElement
    if (!container) return
    const measure = () => {
      setMaximum(inspectorWidthLimit(container.clientWidth))
      const wide = window.innerWidth > MOBILE_BREAKPOINT
      setResizable(wide)
      if (!wide && drag.current) {
        const current = drag.current
        drag.current = null
        releaseDrag(current)
        setDragWidth(null)
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    const cancelOnBlur = () => {
      const current = drag.current
      drag.current = null
      releaseDrag(current)
      setDragWidth(null)
    }
    window.addEventListener("resize", measure)
    window.addEventListener("blur", cancelOnBlur)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
      window.removeEventListener("blur", cancelOnBlur)
      const current = drag.current
      drag.current = null
      releaseDrag(current)
    }
  }, [])

  function cancelDrag(pointerId: number) {
    if (drag.current?.pointerId !== pointerId) return
    const current = drag.current
    drag.current = null
    releaseDrag(current)
    setDragWidth(null)
  }

  return (
    <aside
      id={id}
      ref={aside}
      className={`workspace-inspector resizable-inspector ${className ?? ""}`}
      aria-label={label}
      data-resizing={dragWidth !== null || undefined}
      style={{ "--inspector-width": `${width}px` } as CSSProperties}
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
            aria-valuenow={width}
            aria-valuetext={`${width} pixels`}
            data-resizing={dragWidth !== null || undefined}
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0 || drag.current) return
              event.preventDefault()
              event.currentTarget.focus({ preventScroll: true })
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startWidth: width,
                handle: event.currentTarget,
              }
              setDragWidth(width)
            }}
            onPointerMove={(event) => {
              const current = drag.current
              if (current?.pointerId !== event.pointerId) return
              setDragWidth(
                boundedInspectorWidth(current.startWidth + current.startX - event.clientX, maximum),
              )
            }}
            onPointerUp={(event) => {
              const current = drag.current
              if (current?.pointerId !== event.pointerId) return
              drag.current = null
              releaseDrag(current)
              setPreferredWidth(
                boundedInspectorWidth(current.startWidth + current.startX - event.clientX, maximum),
              )
              setDragWidth(null)
            }}
            onPointerCancel={(event) => cancelDrag(event.pointerId)}
            onLostPointerCapture={(event) => cancelDrag(event.pointerId)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && drag.current) {
                event.preventDefault()
                cancelDrag(drag.current.pointerId)
                return
              }
              const next = inspectorKeyboardWidth(event.key, width, maximum, event.shiftKey)
              if (next === undefined || drag.current) return
              event.preventDefault()
              setPreferredWidth(next)
            }}
          />
          <span id={instructionsId} className="sr-only">
            Use Left and Right arrows to resize. Home sets the minimum width; End sets the maximum.
          </span>
        </>
      )}
      <div className="inspector-content">{children}</div>
      {dragWidth !== null &&
        createPortal(<div className="inspector-resize-shield" aria-hidden="true" />, document.body)}
    </aside>
  )
}
