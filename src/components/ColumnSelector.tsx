import { useI18n, type TKey } from '../i18n'
import { canFake } from '../lib/fake'
import { isValidPrefix } from '../lib/normalize'
import { createPreviewer } from '../lib/preview'
import { DATA_TYPES, isReversible, METHODS, type ColumnConfig, type DataType, type Method } from '../lib/types'
import { cx } from '../util'
import type { ColumnInfo } from '../workers/protocol'
import { ArrowRightIcon, WandIcon } from './icons'
import { Hint, Tooltip } from './Tooltip'
import { btnGhost, inputBase, ReversibleBadge } from './ui'

interface Props {
  columns: ColumnInfo[]
  configs: Record<string, ColumnConfig>
  onChange: (key: string, patch: Partial<ColumnConfig>) => void
  onAll: (enabled: boolean) => void
  onSuggested: () => void
  showSheets: boolean
}

export function methodsFor(type: DataType): Method[] {
  return METHODS[type].filter((m) => m !== 'fake' || canFake(type))
}

export function ColumnSelector({ columns, configs, onChange, onAll, onSuggested, showSheets }: Props) {
  const { t } = useI18n()
  const preview = createPreviewer()

  const prefixUse = new Map<string, number>()
  for (const c of Object.values(configs)) {
    if (c.enabled && c.method === 'code') prefixUse.set(c.prefix, (prefixUse.get(c.prefix) ?? 0) + 1)
  }
  const anySuggested = columns.some((c) => c.suggestion)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-1">
        {anySuggested && (
          <Tooltip content={t('selectSuggestedHint')} align="end">
            <button type="button" className={cx(btnGhost, 'text-emerald-700 dark:text-emerald-400')} onClick={onSuggested}>
              <WandIcon /> {t('selectSuggested')}
            </button>
          </Tooltip>
        )}
        <button type="button" className={btnGhost} onClick={() => onAll(true)}>
          {t('selectAll')}
        </button>
        <button type="button" className={btnGhost} onClick={() => onAll(false)}>
          {t('selectNone')}
        </button>
      </div>

      <div className="hidden grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-4 px-4 text-xs font-semibold tracking-wide text-slate-500 uppercase md:grid dark:text-slate-400">
        <span>{t('colMask')}</span>
        <span>{t('colColumn')}</span>
        <span className="flex items-center gap-1">
          {t('colType')} <Hint text={t('colTypeHint')} />
        </span>
        <span className="flex items-center gap-1">
          {t('colMethod')} <Hint text={t('colMethodHint')} align="end" />
        </span>
      </div>

      <ul className="space-y-2.5">
        {columns.map((col) => {
          const cfg = configs[col.key]
          const isCode = cfg.method === 'code'
          const prefixOk = isValidPrefix(cfg.prefix)
          const shared = cfg.enabled && isCode && (prefixUse.get(cfg.prefix) ?? 0) > 1
          const inputId = `col-${col.key}`
          const sample = col.samples[0]
          const example = sample !== undefined ? preview(cfg, sample) : null
          return (
            <li
              key={col.key}
              className={cx(
                'rounded-2xl border transition',
                cfg.enabled
                  ? 'border-emerald-300 bg-emerald-50/50 shadow-sm shadow-emerald-500/5 dark:border-emerald-800/80 dark:bg-emerald-950/20'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700',
              )}
            >
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 p-3.5 md:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)] md:items-center md:gap-x-4">
                <div className="row-span-3 flex justify-center pt-0.5 md:row-span-1 md:pt-0">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => onChange(col.key, { enabled: e.target.checked })}
                    aria-label={col.header}
                    className="size-5 cursor-pointer rounded accent-emerald-600"
                  />
                </div>

                <label htmlFor={inputId} className="min-w-0 cursor-pointer">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold break-words">{col.header || `(${t('colColumn')} ${col.key.slice(1)})`}</span>
                    {col.suggestion && col.suggestion.type !== 'custom' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                        <WandIcon /> {t(`type_${col.suggestion.type}` as TKey)}
                      </span>
                    )}
                  </span>
                  {showSheets && col.sheets.length > 1 && (
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{t('inSheets', { sheets: col.sheets.join(', ') })}</span>
                  )}
                  {col.samples.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {col.samples.map((s, i) => (
                        <span
                          key={i}
                          className="max-w-[12rem] truncate rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          title={s}
                        >
                          {s}
                        </span>
                      ))}
                    </span>
                  )}
                </label>

                <select
                  aria-label={t('colType')}
                  value={cfg.type}
                  onChange={(e) => {
                    const type = e.target.value as DataType
                    const allowed = methodsFor(type)
                    onChange(col.key, { type, enabled: true, method: allowed.includes(cfg.method) ? cfg.method : allowed[0] })
                  }}
                  className={cx(inputBase, 'col-start-2 w-full md:col-start-auto')}
                >
                  {DATA_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`type_${type}` as TKey)}
                    </option>
                  ))}
                </select>

                <select
                  aria-label={t('colMethod')}
                  value={cfg.method}
                  onChange={(e) => onChange(col.key, { method: e.target.value as Method, enabled: true })}
                  className={cx(inputBase, 'col-start-2 w-full md:col-start-auto')}
                >
                  {methodsFor(cfg.type).map((m) => (
                    <option key={m} value={m}>
                      {t(`method_${m}` as TKey)}
                      {isReversible(m) ? ' ↺' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {cfg.enabled && (
                <div className="mx-3.5 mb-3.5 flex flex-col gap-3 rounded-xl bg-white/80 p-3 ring-1 ring-emerald-100 md:ml-[4.25rem] md:flex-row md:items-center dark:bg-slate-950/50 dark:ring-emerald-900/50">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReversibleBadge reversible={isReversible(cfg.method)} label={isReversible(cfg.method) ? t('reversible') : t('oneWay')} />
                      <span className="text-xs text-slate-600 dark:text-slate-400">{t(`methodDesc_${cfg.method}` as TKey)}</span>
                    </div>
                    {example !== null && (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{t('example')}:</span>
                        <code className="max-w-[14rem] truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{sample}</code>
                        <ArrowRightIcon className="shrink-0 text-emerald-600" />
                        <code className="max-w-[16rem] truncate rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {example}
                        </code>
                      </div>
                    )}
                  </div>
                  {isCode && (
                    <div className="w-full shrink-0 space-y-1 md:w-60">
                      <label className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                        {t('colPrefix')} <Hint text={t('colPrefixHint')} align="end" />
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          aria-label={t('colPrefix')}
                          value={cfg.prefix}
                          onChange={(e) => onChange(col.key, { prefix: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                          className={cx(
                            inputBase,
                            'w-full min-w-0 py-1.5 font-mono uppercase',
                            !prefixOk && 'border-red-400 focus:border-red-500 focus:ring-red-500/15 dark:border-red-700',
                          )}
                          spellCheck={false}
                          maxLength={24}
                        />
                        <span className="shrink-0 font-mono text-xs text-slate-400">_0001</span>
                      </div>
                      {!prefixOk && <p className="text-xs text-red-600 dark:text-red-400">{t('prefixInvalid')}</p>}
                      {shared && <p className="text-xs text-slate-500 dark:text-slate-400">{t('sharedPrefix')}</p>}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
