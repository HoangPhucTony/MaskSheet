import { useState } from 'react'
import { useI18n } from '../i18n'
import type { ColumnConfig } from '../lib/types'
import { cx } from '../util'
import type { SheetInfo } from '../workers/protocol'

function maskLabel(cfg: ColumnConfig): string {
  if (cfg.type === 'money' && cfg.moneyMode === 'multiply') return '× k'
  if (cfg.type === 'money' && cfg.moneyMode === 'round') return '≈'
  return `${cfg.prefix}_…`
}

export function PreviewTable({ sheets, configs }: { sheets: SheetInfo[]; configs: Record<string, ColumnConfig> }) {
  const { t } = useI18n()
  const [active, setActive] = useState(0)
  const sheet = sheets[Math.min(active, sheets.length - 1)]
  const [header, ...rows] = sheet.preview

  return (
    <div className="space-y-3">
      {sheets.length > 1 && (
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
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
              )}
            >
              {s.name}
              <span className="ml-1.5 text-xs opacity-60">{s.rowCount}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('previewNote', { n: rows.length })}</p>
      <div className="max-h-[26rem] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
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
                      'border-b px-3 py-2 text-left align-bottom font-semibold whitespace-nowrap',
                      on
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100'
                        : 'border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800',
                    )}
                  >
                    {on && <span className="block font-mono text-[11px] font-medium opacity-75">{maskLabel(cfg)}</span>}
                    {h}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/40">
                {row.map((v, c) => {
                  const on = configs[sheet.keys[c]]?.enabled
                  return (
                    <td
                      key={c}
                      className={cx(
                        'max-w-[16rem] truncate border-b border-slate-100 px-3 py-1.5 whitespace-nowrap dark:border-slate-800/70',
                        on && 'bg-emerald-50/80 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
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
