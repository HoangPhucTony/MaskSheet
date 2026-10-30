import { useI18n, type TKey } from '../i18n'
import { methodsFor } from '../lib/fake'
import { colLetter, isValidPrefix } from '../lib/normalize'
import { createPreviewer } from '../lib/preview'
import { DATA_TYPES, isReversible, type ColumnConfig, type DataType, type Method } from '../lib/types'
import { cx } from '../util'
import type { ColumnInfo } from '../workers/protocol'
import { ArrowRightIcon, CheckIcon } from './icons'
import { Hint } from './Tooltip'
import { inputBase, ReversibleBadge } from './ui'
import { TYPE_ICON } from './typeMeta'

interface Props {
  column: ColumnInfo
  config: ColumnConfig
  sharedPrefix: boolean
  onChange: (patch: Partial<ColumnConfig>) => void
}

/** Settings for the column picked in the grid: on/off, data type, method, code prefix. */
export function ColumnInspector({ column, config, sharedPrefix, onChange }: Props) {
  const { t } = useI18n()
  const sample = column.samples[0]
  const methods = methodsFor(config.type)
  const prefixOk = isValidPrefix(config.prefix)

  const setType = (type: DataType) => {
    const allowed = methodsFor(type)
    onChange({ type, enabled: true, method: allowed.includes(config.method) ? config.method : allowed[0] })
  }

  return (
    <div className="space-y-5">
      {/* Column identity + on/off switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
            {t('columnLetter', { letter: colLetter(column.colIndex) })}
            {column.sheets.length > 1 && ` · ${t('inSheets', { sheets: column.sheets.join(', ') })}`}
          </p>
          <p className="truncate text-lg font-bold tracking-tight">{column.header || '—'}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {column.samples.map((s, i) => (
              <span
                key={i}
                className="max-w-[12rem] truncate rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          onClick={() => onChange({ enabled: !config.enabled })}
          className={cx(
            'inline-flex items-center gap-3 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold transition',
            config.enabled
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
          )}
        >
          <span
            className={cx(
              'relative h-6 w-11 rounded-full transition',
              config.enabled ? 'bg-emerald-400/60' : 'bg-slate-300 dark:bg-slate-600',
            )}
          >
            <span
              className={cx(
                'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                config.enabled ? 'left-[1.375rem]' : 'left-0.5',
              )}
            />
          </span>
          {config.enabled ? t('maskThisColumn') : t('keepAsIs')}
        </button>
      </div>

      <div className={cx('space-y-5 transition', !config.enabled && 'pointer-events-none opacity-40')}>
        {/* Data type */}
        <div>
          <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('dataTypeLabel')} <Hint text={t('colTypeHint')} align="start" />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DATA_TYPES.map((type) => {
              const on = config.type === type
              const suggested = column.suggestion?.type === type
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setType(type)}
                  className={cx(
                    'relative inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition',
                    on
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  <span aria-hidden="true">{TYPE_ICON[type]}</span>
                  {t(`type_${type}` as TKey)}
                  {suggested && <span className="absolute -top-1.5 -right-1.5 size-3 rounded-full border-2 border-white bg-sky-500 dark:border-slate-900" title={t('suggested')} />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Method cards */}
        <div>
          <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t('methodLabel')} <Hint text={t('colMethodHint')} align="start" />
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {methods.map((m: Method) => {
              const on = config.method === m
              const example = sample !== undefined ? createPreviewer()({ ...config, method: m }, sample) : null
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ method: m, enabled: true })}
                  className={cx(
                    'group relative flex flex-col gap-2 rounded-2xl border p-3.5 text-left transition',
                    on
                      ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 dark:border-emerald-600 dark:bg-emerald-950/40'
                      : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-800',
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{t(`method_${m}` as TKey)}</span>
                    <span
                      className={cx(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] transition',
                        on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-transparent dark:border-slate-600',
                      )}
                    >
                      <CheckIcon />
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t(`methodDesc_${m}` as TKey)}</span>
                  {example !== null && (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs">
                      <code className="max-w-[45%] truncate rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {sample}
                      </code>
                      <ArrowRightIcon className="shrink-0 text-emerald-600" />
                      <code className="min-w-0 truncate rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {example}
                      </code>
                    </span>
                  )}
                  <ReversibleBadge reversible={isReversible(m)} label={isReversible(m) ? t('reversible') : t('oneWay')} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Code prefix */}
        {config.method === 'code' && (
          <div className="max-w-sm">
            <label className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t('colPrefix')} <Hint text={t('colPrefixHint')} align="start" />
            </label>
            <div className="flex items-center gap-1.5">
              <input
                value={config.prefix}
                onChange={(e) => onChange({ prefix: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                className={cx(
                  inputBase,
                  'w-full min-w-0 font-mono uppercase',
                  !prefixOk && 'border-red-400 focus:border-red-500 focus:ring-red-500/15 dark:border-red-700',
                )}
                spellCheck={false}
                maxLength={24}
              />
              <span className="shrink-0 font-mono text-sm text-slate-400">_0001</span>
            </div>
            {!prefixOk && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t('prefixInvalid')}</p>}
            {sharedPrefix && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('sharedPrefix')}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
