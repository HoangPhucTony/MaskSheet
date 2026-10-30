import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../util'

const WIDTH = 460
const GAP = 8
const MARGIN = 12
const MOBILE = '(max-width: 639px)'
/** Height of the sticky page header; the panel never goes under it. */
const TOP_SAFE = 72

interface Placement {
  top?: number
  bottom?: number
  left: number
  maxHeight: number
}

function place(anchor: DOMRect): Placement {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.min(Math.max(anchor.left + anchor.width / 2 - WIDTH / 2, MARGIN), vw - WIDTH - MARGIN)
  const below = vh - anchor.bottom - GAP - MARGIN
  const above = anchor.top - GAP - MARGIN
  // Prefer below the header; go above only when there is clearly more room there.
  if (below >= 360 || below >= above) {
    const top = Math.max(anchor.bottom + GAP, TOP_SAFE)
    return { top, left, maxHeight: Math.max(240, vh - top - MARGIN) }
  }
  return { bottom: vh - anchor.top + GAP, left, maxHeight: Math.max(240, above - TOP_SAFE) }
}

/**
 * A floating panel attached to `anchor` (re-measured on scroll and resize).
 * On small screens it becomes a bottom sheet. Closes on Escape or a click outside,
 * except clicks matching `ignoreOutside` (e.g. other column headers, which re-target it).
 */
export function Popover({
  anchorKey,
  anchor,
  onClose,
  ignoreOutside,
  label,
  children,
}: {
  /** Changes whenever the panel should re-attach to a different element. */
  anchorKey: string
  anchor: () => HTMLElement | null
  onClose: () => void
  ignoreOutside?: (target: Element) => boolean
  label: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Placement | null>(null)
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE).matches)
  const handlers = useRef({ anchor, onClose, ignoreOutside })
  handlers.current = { anchor, onClose, ignoreOutside }

  useLayoutEffect(() => {
    const update = () => {
      setMobile(window.matchMedia(MOBILE).matches)
      const el = handlers.current.anchor()
      setPos(el ? place(el.getBoundingClientRect()) : null)
    }
    // If the anchor is hidden (under the sticky page header or off screen), bring it into view first.
    const el = handlers.current.anchor()
    if (el && !window.matchMedia(MOBILE).matches) {
      const r = el.getBoundingClientRect()
      if (r.top < TOP_SAFE || r.bottom > window.innerHeight - 200) {
        window.scrollBy({ top: r.top - TOP_SAFE - 16 })
      }
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && handlers.current.onClose()
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element
      if (panelRef.current?.contains(target)) return
      if (handlers.current.ignoreOutside?.(target)) return
      handlers.current.onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [])

  const panel = mobile ? (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-x-hidden overflow-y-auto rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        {children}
      </div>
    </>
  ) : (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      style={
        pos
          ? { top: pos.top, bottom: pos.bottom, left: pos.left, width: WIDTH, maxHeight: pos.maxHeight }
          : { top: '50%', left: '50%', width: WIDTH, maxHeight: '80vh', transform: 'translate(-50%, -50%)' }
      }
      className={cx(
        'fixed z-50 overflow-x-hidden overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-black/5',
        'animate-[popIn_120ms_ease-out] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/50',
      )}
    >
      {children}
    </div>
  )

  return createPortal(panel, document.body)
}
