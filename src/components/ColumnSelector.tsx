import { useI18n, type TKey } from '../i18n'
import { isValidPrefix } from '../lib/normalize'
import type { ColumnConfig, DataType, MoneyMode } from '../lib/types'
import { cx } from '../util'
import type { ColumnInfo } from '../workers/protocol'
import { btnGhost, inputBase } from './ui'

const TYPES: DataType[] = ['name', 'phone', 'email', 'id', 'address', 'org', 'money', 'custom']
const MONEY_MODES: MoneyMode[] = ['multiply', 'code', 'round']

interface Props {
  columns: ColumnInfo[]
  configs: Record<string, ColumnConfig>
  onChange: (key: string, patch: Partial<ColumnConfig>) => void
  onAll: (enabled: boolean) => void
  showSheets: boolean
}

export function ColumnSelector({ columns, configs, onChange, onAll, showSheets }: Props) {
  const { t } = useI18n()

  const prefixUse = new Map<string, number>()
  for (const c of Object.values(configs)) {
    if (c.enabled && (c.type !== 'money' || c.moneyMode === 'code')) prefixUse.set(c.prefix, (prefixUse.get(c.prefix) ?? 0) + 1)
  }
  const anyMoney = Object.values(configs).some((c) => c.enabled && c.type === 'money' && c.moneyMode === 'multiply')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t('columnsHelp')}</p>
        <div className="flex gap-1">
          <button type="button" className={btnGhost} onClick={() => onAll(true)}>
            {t('selectAll')}
          </button>
          <button type="button" className={btnGhost} onClick={() => onAll(false)}>
            {t('selectNone')}
          </button>
        </div>
      </div>

      <div className="hidden grid-cols-[2.5rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-3 text-xs font-semibold tracking-wide text-slate-500 uppercase md:grid dark:text-slate-400">
        <span>{t('colMask')}</span>
        <span>{t('colColumn')}</span>
        <span>{t('colType')}</span>
        <span>{t('colPrefix')}</span>
      </div>

      <ul className="space-y-2">
        {columns.map((col) => {
          const cfg = configs[col.key]
          const codeMode = cfg.type !== 'money' || cfg.moneyMode === 'code'
          const prefixOk = isValidPrefix(cfg.prefix)
          const shared = cfg.enabled && codeMode && (prefixUse.get(cfg.prefix) ?? 0) > 1
          const inputId = `col-${col.key}`
          return (
            <li
              key={col.key}
              className={cx(
                'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border p-3 transition md:grid-cols-[2.5rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center',
                cfg.enabled
                  ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
                  : 'border-slate-200 dark:border-slate-800',
              )}
            >
              <div className="row-span-3 flex justify-center pt-0.5 md:row-span-1 md:pt-0">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={(e) => onChange(col.key, { enabled: e.target.checked })}
                  className="size-5 cursor-pointer rounded accent-emerald-600"
                />
              </div>

              <label htmlFor={inputId} className="min-w-0 cursor-pointer">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold break-words">{col.header || `(${t('colColumn')} ${col.key.slice(1)})`}</span>
                  {col.suggestion && col.suggestion.type !== 'custom' && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                      {t('suggested')}: {t(`type_${col.suggestion.type}` as TKey)}
                    </span>
                  )}
                </span>
                {showSheets && col.sheets.length > 1 && (
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{t('inSheets', { sheets: col.sheets.join(', ') })}</span>
                )}
                {col.samples.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {col.samples.map((s, i) => (
                      <span
                        key={i}
                        className="max-w-[12rem] truncate rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        title={s}
                      >
                        {s}
                      </span>
                    ))}
                  </span>
                )}
              </label>

              <div className="col-start-2 md:col-start-auto">
                <select
                  aria-label={t('colType')}
                  value={cfg.type}
                  onChange={(e) => onChange(col.key, { type: e.target.value as DataType, enabled: true })}
                  className={cx(inputBase, 'w-full')}
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`type_${type}` as TKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-start-2 space-y-1.5 md:col-start-auto">
                {cfg.type === 'money' && (
                  <select
                    aria-label={t('type_money')}
                    value={cfg.moneyMode}
                    onChange={(e) => onChange(col.key, { moneyMode: e.target.value as MoneyMode, enabled: true })}
                    className={cx(inputBase, 'w-full')}
                  >
                    {MONEY_MODES.map((m) => (
                      <option key={m} value={m}>
                        {t(`money_${m}` as TKey)}
                      </option>
                    ))}
                  </select>
                )}
                {codeMode && (
                  <div className="flex items-center gap-1.5">
                    <input
                      aria-label={t('colPrefix')}
                      value={cfg.prefix}
                      onChange={(e) => onChange(col.key, { prefix: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                      className={cx(
                        inputBase,
                        'w-full min-w-0 font-mono uppercase',
                        !prefixOk && 'border-red-400 focus:border-red-500 focus:ring-red-500/30 dark:border-red-700',
                      )}
                      spellCheck={false}
                      maxLength={24}
                    />
                    <span className="shrink-0 font-mono text-xs text-slate-400">_0001</span>
                  </div>
                )}
                {!prefixOk && codeMode && <p className="text-xs text-red-600 dark:text-red-400">{t('prefixInvalid')}</p>}
                {shared && <p className="text-xs text-slate-500 dark:text-slate-400">{t('sharedPrefix', { prefix: cfg.prefix })}</p>}
              </div>
            </li>
          )
        })}
      </ul>
      {anyMoney && <p className="text-xs text-slate-500 dark:text-slate-400">{t('moneyHelp')}</p>}
    </div>
  )
}
