import type { ReactNode } from 'react'
import { cx } from '../util'
import { AlertIcon, CheckIcon, InfoIcon, KeyIcon } from './icons'
import { Hint } from './Tooltip'

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/30 ring-1 ring-emerald-700/20 transition hover:from-emerald-500 hover:to-emerald-700 hover:shadow-md active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:from-slate-800 dark:disabled:to-slate-800 dark:disabled:text-slate-500'

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'

export const inputBase =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-xs transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        'rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] sm:p-7 dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function StepTitle({ n, children, hint, aside }: { n: number; children: ReactNode; hint?: string; aside?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-3 text-lg font-semibold tracking-tight">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-sm shadow-emerald-600/30">
          {n}
        </span>
        {children}
        {hint && <Hint text={hint} align="start" />}
      </h2>
      {aside}
    </div>
  )
}

type AlertKind = 'info' | 'warn' | 'error' | 'success' | 'danger'

const alertStyles: Record<AlertKind, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100',
  warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100',
  error: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100',
  danger: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100',
}

const alertIcons: Record<AlertKind, ReactNode> = {
  info: <InfoIcon />,
  warn: <AlertIcon />,
  error: <AlertIcon />,
  success: <CheckIcon />,
  danger: <KeyIcon />,
}

export function Alert({ kind, title, children }: { kind: AlertKind; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={kind === 'error' ? 'alert' : undefined} className={cx('flex gap-3 rounded-2xl border p-4 text-sm', alertStyles[kind])}>
      <span className="mt-0.5 shrink-0 text-base">{alertIcons[kind]}</span>
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  )
}

export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="space-y-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-[width] duration-200"
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </div>
    </div>
  )
}

/** Small colored pill telling whether a method can be undone. */
export function ReversibleBadge({ reversible, label }: { reversible: boolean; label: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        reversible
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      )}
    >
      {reversible ? '↺' : '→'} {label}
    </span>
  )
}
