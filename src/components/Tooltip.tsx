import { useId, type ReactNode } from 'react'
import { cx } from '../util'
import { HelpIcon } from './icons'

type Side = 'top' | 'bottom'
type Align = 'center' | 'start' | 'end'

const sideClass: Record<Side, string> = {
  top: 'bottom-full mb-2',
  bottom: 'top-full mt-2',
}

const alignClass: Record<Align, string> = {
  center: 'left-1/2 -translate-x-1/2',
  start: 'left-0',
  end: 'right-0',
}

/**
 * Show `content` when the wrapped element is hovered or focused (tap on touch screens).
 * Pure CSS, so it costs nothing until it is shown.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  className,
}: {
  content: ReactNode
  children: ReactNode
  side?: Side
  align?: Align
  className?: string
}) {
  const id = useId()
  return (
    <span className={cx('group/tip relative inline-flex', className)} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-50 w-max max-w-[min(18rem,80vw)] rounded-xl bg-slate-900 px-3 py-2 text-left text-xs leading-relaxed font-normal text-slate-100 normal-case shadow-xl ring-1 ring-white/10',
          'invisible translate-y-1 opacity-0 transition duration-150 group-focus-within/tip:visible group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:translate-y-0 group-hover/tip:opacity-100',
          'dark:bg-slate-100 dark:text-slate-900 dark:ring-black/10',
          sideClass[side],
          alignClass[align],
        )}
      >
        {content}
      </span>
    </span>
  )
}

/** A small (?) icon that explains something on hover or tap. */
export function Hint({ text, side, align, label }: { text: ReactNode; side?: Side; align?: Align; label?: string }) {
  return (
    <Tooltip content={text} side={side} align={align}>
      <button
        type="button"
        aria-label={label ?? 'Help'}
        className="inline-flex size-5 cursor-help items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
      >
        <HelpIcon />
      </button>
    </Tooltip>
  )
}
