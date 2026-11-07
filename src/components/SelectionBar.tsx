import { useState } from 'react'
import { useI18n, type TKey } from '../i18n'
import { selectionSummary } from '../lib/selection'
import type { ColumnConfig } from '../lib/types'
import { cx } from '../util'
import type { ColumnInfo } from '../workers/protocol'
import { ShieldIcon, XIcon } from './icons'
import { Tooltip } from './Tooltip'
import { TYPE_ICON } from './typeMeta'
import { Alert, btnGhost, btnPrimary, ProgressBar } from './ui'

interface Props {
  selected: ColumnInfo[]
  configs: Record<string, ColumnConfig>
  multiSheet: boolean
  badPrefix: ColumnInfo[]
  masking: boolean
  /** True while a sheet is being re-read. */
  disabled: boolean
  progress: { pct: number; label: string; pulse: boolean }
  error: string | null
  onMask: () => void
  onOpenColumn: (c: ColumnInfo) => void
  onRemove: (c: ColumnInfo) => void
}

/** Sticky bottom bar: mask button, selection summary and an expandable list of selected columns. */
export function SelectionBar({
  selected,
  configs,
  multiSheet,
  badPrefix,
  masking,
  disabled,
  progress,
  error,
  onMask,
  onOpenColumn,
  onRemove,
}: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  // Adjust state during render: an empty selection collapses the list, so a later selection starts collapsed.
  if (open && selected.length === 0) setOpen(false)
  const showList = open && selected.length > 0 && !masking

  const groups: { sheet: string; cols: ColumnInfo[] }[] = []
  for (const c of selected) {
    const g = groups.find((x) => x.sheet === c.sheet)
    if (g) g.cols.push(c)
    else groups.push({ sheet: c.sheet, cols: [c] })
  }

  return (
    <div className="sticky bottom-3 z-30 space-y-3">
      {error && <Alert kind="error">{error}</Alert>}
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-lg dark:border-slate-700 dark:bg-slate-900/90">
        {showList && (
          <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.sheet} className="space-y-1">
                {multiSheet && (
                  <div className="truncate text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{g.sheet}</div>
                )}
                {g.cols.map((c) => {
                  const cfg = configs[c.key]
                  return (
                    <div
                      key={c.key}
                      data-column-chip
                      className={cx(
                        'flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
                        badPrefix.includes(c) && 'ring-2 ring-red-500',
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 pl-2.5 text-left"
                        onClick={() => onOpenColumn(c)}
                      >
                        <span aria-hidden="true">{TYPE_ICON[cfg.type]}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{c.header || '—'}</span>
                        <span className="shrink-0 text-xs opacity-70">{t(`method_${cfg.method}` as TKey)}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={t('removeColumn')}
                        title={t('removeColumn')}
                        className="flex shrink-0 items-center px-2 py-1.5 opacity-70 transition hover:opacity-100"
                        onClick={() => onRemove(c)}
                      >
                        <XIcon />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {masking ? (
            <div className="min-w-0 flex-1">
              <ProgressBar pct={progress.pct} pulse={progress.pulse} label={progress.label} />
            </div>
          ) : (
            <>
              <Tooltip content={t('maskButtonHint')} align="start">
                <button type="button" className={btnPrimary} disabled={selected.length === 0 || disabled || badPrefix.length > 0} onClick={onMask}>
                  <ShieldIcon /> {t('maskButton')}
                </button>
              </Tooltip>
              {badPrefix.length > 0 ? (
                <span className="min-w-0 flex-1 text-sm font-medium text-red-600 dark:text-red-400">
                  {t('badPrefixBlock', { columns: badPrefix.map((c) => c.header || c.key).join(', ') })}
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-slate-500 dark:text-slate-400">
                  {selected.length
                    ? `${t('selectedCount', { n: selected.length })} · ${selectionSummary(selected, { withSheet: multiSheet })}`
                    : t('noneSelected')}
                </span>
              )}
              {selected.length > 0 && (
                <button type="button" className={btnGhost} aria-expanded={showList} onClick={() => setOpen((v) => !v)}>
                  {showList ? `${t('hideSelected')} ▾` : `${t('showSelected')} ▴`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
