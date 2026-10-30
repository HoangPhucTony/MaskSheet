import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, type TKey } from '../i18n'
import { colLetter } from '../lib/normalize'
import { createPreviewer } from '../lib/preview'
import type { ColumnConfig } from '../lib/types'
import { cx } from '../util'
import type { ColumnInfo, SheetInfo } from '../workers/protocol'
import { CheckIcon, WandIcon } from './icons'
import { TYPE_ICON } from './typeMeta'

interface Props {
  sheets: SheetInfo[]
  columns: ColumnInfo[]
  configs: Record<string, ColumnConfig>
  activeKey: string | null
  /** Click on a column (header or any cell). */
  onPick: (key: string) => void
  showOriginal: boolean
}

/**
 * The file shown as a spreadsheet. Columns are picked horizontally by clicking their
 * header or any of their cells; picked columns show what the AI will see.
 */
export function ColumnGrid({ sheets, columns, configs, activeKey, onPick, showOriginal }: Props) {
  const { t } = useI18n()
  const [activeSheet, setActiveSheet] = useState(0)
  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const sheet = sheets[Math.min(activeSheet, sheets.length - 1)]
  const [header, ...rows] = sheet.preview
  const scrollRef = useRef<HTMLDivElement>(null)

  // Bring the focused column into view, e.g. after clicking its chip below the grid.
  useEffect(() => {
    if (!activeKey) return
    const cell = scrollRef.current?.querySelector<HTMLElement>(`th[data-key="${CSS.escape(activeKey)}"]`)
    const box = scrollRef.current
    if (!cell || !box) return
    const left = cell.offsetLeft - 48
    const right = cell.offsetLeft + cell.offsetWidth
    if (left < box.scrollLeft || right > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
    }
  }, [activeKey, activeSheet])

  const suggestionOf = useMemo(() => new Map(columns.map((c) => [c.key, c.suggestion])), [columns])

  // One previewer for all sheets, so equal values show the same code everywhere.
  const masked = useMemo(() => {
    const preview = createPreviewer()
    return sheets.map((s) =>
      s.preview.slice(1).map((row) =>
        row.map((v, c) => {
          const cfg = configs[s.keys[c]]
          return cfg?.enabled ? preview(cfg, v) : v
        }),
      ),
    )
  }, [sheets, configs])
  const shown = showOriginal ? rows : masked[sheets.indexOf(sheet)]

  const colState = (c: number) => {
    const key = sheet.keys[c]
    const cfg = configs[key]
    return { key, cfg, on: !!cfg?.enabled, active: key === activeKey, hover: hoverCol === c }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div ref={scrollRef} className="max-h-[30rem] overflow-auto" onMouseLeave={() => setHoverCol(null)}>
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm select-none">
          <thead className="sticky top-0 z-20">
            {/* Column letters, like Excel */}
            <tr>
              <th className="sticky left-0 z-30 w-10 border-r border-b border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
              {header.map((_, c) => {
                const { key, on, active, hover } = colState(c)
                return (
                  <th
                    key={c}
                    onClick={() => onPick(key)}
                    onMouseEnter={() => setHoverCol(c)}
                    className={cx(
                      'cursor-pointer border-r border-b border-slate-200 px-2 py-1 text-center text-[11px] font-semibold tracking-wider transition-colors dark:border-slate-800',
                      on
                        ? 'bg-emerald-500 text-white dark:bg-emerald-600'
                        : hover
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400',
                      active && 'shadow-[inset_0_3px_0_0_#047857]',
                    )}
                  >
                    {colLetter(sheet.firstCol + c)}
                  </th>
                )
              })}
            </tr>
            {/* Header names: the main click target */}
            <tr>
              <th className="sticky left-0 z-30 border-r border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" />
              {header.map((h, c) => {
                const { key, cfg, on, active, hover } = colState(c)
                const suggestion = suggestionOf.get(key)
                return (
                  <th
                    key={c}
                    onClick={() => onPick(key)}
                    onMouseEnter={() => setHoverCol(c)}
                    aria-pressed={on}
                    data-key={key}
                    title={on ? t('removeColumn') : t('clickToSelect')}
                    className={cx(
                      'min-w-[9rem] cursor-pointer border-r border-b px-3 py-2.5 text-left align-top font-semibold transition-colors',
                      on
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-50'
                        : hover
                          ? 'border-slate-200 bg-emerald-50/60 dark:border-slate-800 dark:bg-emerald-950/30'
                          : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
                      active && 'outline-2 -outline-offset-2 outline-emerald-500',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cx(
                          'flex size-4.5 shrink-0 items-center justify-center rounded-md border text-[11px] transition',
                          on
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-800',
                        )}
                      >
                        <CheckIcon />
                      </span>
                      <span className="truncate">{h || '—'}</span>
                    </span>
                    <span className="mt-1.5 block h-5">
                      {on && cfg ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white">
                          {TYPE_ICON[cfg.type]} {t(`method_${cfg.method}` as TKey)}
                        </span>
                      ) : suggestion ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                          <WandIcon /> {t(`type_${suggestion.type}` as TKey)}
                        </span>
                      ) : (
                        <span className={cx('text-[10px] font-medium text-slate-400 transition', hover ? 'opacity-100' : 'opacity-0')}>
                          {t('clickToSelect')}
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 border-r border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-[11px] font-medium text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                  {r + 2}
                </td>
                {row.map((v, c) => {
                  const { key, on, active, hover } = colState(c)
                  return (
                    <td
                      key={c}
                      onClick={() => onPick(key)}
                      onMouseEnter={() => setHoverCol(c)}
                      title={v}
                      className={cx(
                        'max-w-[16rem] cursor-pointer truncate border-r border-b px-3 py-1.5 whitespace-nowrap transition-colors',
                        on
                          ? cx(
                              'border-emerald-100 text-emerald-900 dark:border-emerald-950 dark:text-emerald-200',
                              !showOriginal && 'font-mono text-[12.5px]',
                              active ? 'bg-emerald-100/80 dark:bg-emerald-900/40' : 'bg-emerald-50/70 dark:bg-emerald-950/30',
                            )
                          : cx(
                              'border-slate-100 text-slate-700 dark:border-slate-800/70 dark:text-slate-300',
                              hover && 'bg-emerald-50/50 dark:bg-emerald-950/20',
                            ),
                      )}
                    >
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sheet tabs at the bottom, like Excel */}
      <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
        {sheets.map((s, i) => (
          <button
            key={s.name}
            type="button"
            role="tab"
            aria-selected={s === sheet}
            onClick={() => setActiveSheet(i)}
            className={cx(
              'shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition',
              s === sheet
                ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-950 dark:text-emerald-300 dark:ring-slate-700'
                : 'text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
            )}
          >
            {s.name}
          </button>
        ))}
        <span className="ml-auto shrink-0 pl-3 text-[11px] text-slate-400">
          {t('rowsShown', { n: rows.length, total: sheet.rowCount.toLocaleString() })}
        </span>
      </div>
    </div>
  )
}
