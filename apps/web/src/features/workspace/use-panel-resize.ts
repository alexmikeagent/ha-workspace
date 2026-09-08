import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"

export type PanelSide = "left" | "right"

export function clampPanelWidth(width: number, minimum: number, maximum: number, fallback: number) {
  return Math.round(Math.max(minimum, Math.min(maximum, Number.isFinite(width) ? width : fallback)))
}

export function panelKeyboardWidth(
  key: string,
  width: number,
  minimum: number,
  maximum: number,
  side: PanelSide,
  shift = false,
) {
  const step = shift ? 32 : 16
  const direction = side === "left" ? 1 : -1
  switch (key) {
    case "ArrowLeft":
      return clampPanelWidth(width - direction * step, minimum, maximum, minimum)
    case "ArrowRight":
      return clampPanelWidth(width + direction * step, minimum, maximum, minimum)
    case "Home":
      return minimum
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

/** Owns one DOM drag; only a completed gesture writes the persistent preference. */
export function usePanelResize({
  preferredWidth,
  onCommit,
  minimum,
  maximum,
  fallback,
  side,
  enabled,
}: {
  readonly preferredWidth: number
  readonly onCommit: (width: number) => void
  readonly minimum: number
  readonly maximum: number
  readonly fallback: number
  readonly side: PanelSide
  readonly enabled: boolean
}) {
  const [draftWidth, setDraftWidth] = useState<number | null>(null)
  const drag = useRef<Drag | null>(null)
  const width = clampPanelWidth(draftWidth ?? preferredWidth, minimum, maximum, fallback)

  useEffect(() => {
    const onBlur = () => {
      const current = drag.current
      drag.current = null
      releaseDrag(current)
      setDraftWidth(null)
    }
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("blur", onBlur)
      const current = drag.current
      drag.current = null
      releaseDrag(current)
    }
  }, [])

  useEffect(() => {
    if (enabled || !drag.current) return
    const current = drag.current
    drag.current = null
    releaseDrag(current)
    // oxlint-disable-next-line react/set-state-in-effect -- Cancelling native pointer capture must also clear its temporary DOM width.
    setDraftWidth(null)
  }, [enabled])

  function cancelDrag(pointerId: number) {
    if (drag.current?.pointerId !== pointerId) return
    const current = drag.current
    drag.current = null
    releaseDrag(current)
    setDraftWidth(null)
  }

  function pointerWidth(current: Drag, clientX: number) {
    const direction = side === "left" ? 1 : -1
    return clampPanelWidth(
      current.startWidth + direction * (clientX - current.startX),
      minimum,
      maximum,
      fallback,
    )
  }

  return {
    width,
    dragging: enabled && draftWidth !== null,
    handleProps: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (!enabled || !event.isPrimary || event.button !== 0 || drag.current) return
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: width,
          handle: event.currentTarget,
        }
        setDraftWidth(width)
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current
        if (!enabled || current?.pointerId !== event.pointerId) return
        setDraftWidth(pointerWidth(current, event.clientX))
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current
        if (current?.pointerId !== event.pointerId) return
        if (!enabled) {
          cancelDrag(event.pointerId)
          return
        }
        drag.current = null
        releaseDrag(current)
        onCommit(pointerWidth(current, event.clientX))
        setDraftWidth(null)
      },
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => cancelDrag(event.pointerId),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => cancelDrag(event.pointerId),
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape" && drag.current) {
          event.preventDefault()
          cancelDrag(drag.current.pointerId)
          return
        }
        const next = panelKeyboardWidth(event.key, width, minimum, maximum, side, event.shiftKey)
        if (!enabled || next === undefined || drag.current) return
        event.preventDefault()
        onCommit(next)
      },
    },
  }
}
