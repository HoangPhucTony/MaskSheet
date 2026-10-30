import { useMemo, useState } from 'react'
import { useI18n, type TKey } from '../i18n'
import { createPreviewer } from '../lib/preview'
import type { ColumnConfig } from '../lib/types'
import { cx } from '../util'
import type { SheetInfo } from '../workers/protocol'

export function PreviewTable({ sheets, configs }: { sheets: SheetInfo[]; configs: Record<string, ColumnConfig> }) {
  const { t } = useI18n()
  const [active, setActive] = useState(0)
  const [after, setAfter] = useState(false)
  const sheet = sheets[Math.min(active, sheets.length - 1)]
  const [header, ...rows] = sheet.preview

  // One previewer across all sheets, so equal values show the same code everywhere.
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

  const shown = after ? masked[sheets.indexOf(sheet)] : rows

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {sheets.length > 1 ? (
          <div role="tablist" className="flex flex-wrap gap-1.5">
            {sheets.map((s, i) => (
              <button
                key={s.name}
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  i === active
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                )}
              >
                {s.name}
                <span className="ml-1.5 text-xs opacity-60">{s.rowCount}</span>
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm dark:bg-slate-800">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setAfter(v)}
              aria-pressed={after === v}
              className={cx(
                'rounded-md px-3 py-1 font-medium transition',
                after === v
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white',
              )}
            >
              {v ? t('previewAfter') : t('previewBefore')}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {after ? t('previewAfterNote') : t('previewNote', { n: rows.length })}
      </p>
      <div className="max-h-[28rem] overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              {header.map((h, i) => {
                const cfg = configs[sheet.keys[i]]
                const on = cfg?.enabled
                return (
                  <th
                    key={i}
                    className={cx(
                      'border-b px-3 py-2.5 text-left align-bottom font-semibold whitespace-nowrap',
                      on
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100'
                        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200',
                    )}
                  >
                    {on && (
                      <span className="block text-[10px] font-semibold tracking-wide uppercase opacity-70">
                        {t(`method_${cfg.method}` as TKey)}
                      </span>
                    )}
                    {h}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r} className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-900/40">
                {row.map((v, c) => {
                  const on = configs[sheet.keys[c]]?.enabled
                  return (
                    <td
                      key={c}
                      className={cx(
                        'max-w-[16rem] truncate border-b border-slate-100 px-3 py-2 whitespace-nowrap dark:border-slate-800/70',
                        on && 'bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-200',
                        on && after && 'font-mono text-[13px]',
                      )}
                      title={v}
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
    </div>
  )
}
