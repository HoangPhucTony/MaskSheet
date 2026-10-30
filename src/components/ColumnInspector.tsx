import { useI18n, type TKey } from '../i18n'
import { methodsFor } from '../lib/fake'
import { colLetter, isValidPrefix } from '../lib/normalize'
import { createPreviewer } from '../lib/preview'
import { DATA_TYPES, isReversible, type ColumnConfig, type DataType } from '../lib/types'
import { cx } from '../util'
import type { ColumnInfo } from '../workers/protocol'
import { ArrowRightIcon, XIcon } from './icons'
import { Hint } from './Tooltip'
import { btnPrimary, inputBase } from './ui'
import { TYPE_ICON } from './typeMeta'

interface Props {
  column: ColumnInfo
  config: ColumnConfig
  sharedPrefix: boolean
  onChange: (patch: Partial<ColumnConfig>) => void
  onClose: () => void
}

function SectionLabel({ children, hint }: { children: string; hint: string }) {
  return (
    <p className="mb-2 flex items-center gap-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
      {children} <Hint text={hint} align="start" />
    </p>
  )
}

/** Compact settings for one column, shown in the popup next to its header. */
export function ColumnInspector({ column, config, sharedPrefix, onChange, onClose }: Props) {
  const { t } = useI18n()
  const sample = column.samples[0]
  const preview = createPreviewer()
  const prefixOk = isValidPrefix(config.prefix)

  const setType = (type: DataType) => {
    const allowed = methodsFor(type)
    onChange({ type, enabled: true, method: allowed.includes(config.method) ? config.method : allowed[0] })
  }

  return (
    <div className="text-sm">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-200 bg-white/95 px-4 pt-3.5 pb-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xs font-bold text-white">
          {colLetter(column.colIndex)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold tracking-tight">{column.header || '—'}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {column.samples.join(' · ')}
            {column.sheets.length > 1 && ` — ${t('inSheets', { sheets: column.sheets.join(', ') })}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <XIcon />
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* On / off */}
        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          onClick={() => onChange({ enabled: !config.enabled })}
          className={cx(
            'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 font-semibold transition',
            config.enabled
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
              : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          {config.enabled ? t('maskThisColumn') : t('keepAsIs')}
          <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition', config.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')}>
            <span
              className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', config.enabled ? 'left-[1.375rem]' : 'left-0.5')}
            />
          </span>
        </button>

        <div className={cx('space-y-4 transition', !config.enabled && 'pointer-events-none opacity-40')}>
          {/* Data type */}
          <div>
            <SectionLabel hint={t('colTypeHint')}>{t('dataTypeLabel')}</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
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
                      'relative flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs leading-tight font-medium transition',
                      on
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-200'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    <span aria-hidden="true">{TYPE_ICON[type]}</span>
                    <span>{t(`type_${type}` as TKey)}</span>
                    {suggested && (
                      <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-white bg-sky-500 dark:border-slate-900" title={t('suggested')} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Method */}
          <div>
            <SectionLabel hint={t('colMethodHint')}>{t('methodLabel')}</SectionLabel>
            <div className="space-y-1.5" role="radiogroup">
              {methodsFor(config.type).map((m) => {
                const on = config.method === m
                const reversible = isReversible(m)
                const example = sample !== undefined ? preview({ ...config, method: m }, sample) : null
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange({ method: m, enabled: true })}
                    className={cx(
                      'w-full rounded-xl border px-3 py-2 text-left transition',
                      on
                        ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 dark:border-emerald-600 dark:bg-emerald-950/40'
                        : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-emerald-800 dark:hover:bg-slate-800/60',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cx(
                          'flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition',
                          on ? 'border-emerald-600' : 'border-slate-300 dark:border-slate-600',
                        )}
                      >
                        {on && <span className="size-2 rounded-full bg-emerald-600" />}
                      </span>
                      <span className="font-semibold">{t(`method_${m}` as TKey)}</span>
                      <span
                        className={cx(
                          'rounded-full px-1.5 py-px text-[10px] font-semibold',
                          reversible
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                        )}
                      >
                        {reversible ? `↺ ${t('reversible')}` : t('oneWay')}
                      </span>
                      {example !== null && (
                        <span className="ml-auto flex min-w-0 items-center gap-1 text-xs">
                          <ArrowRightIcon className="shrink-0 text-emerald-600" />
                          <code className="max-w-[9rem] truncate rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {example}
                          </code>
                        </span>
                      )}
                    </span>
                    {on && (
                      <span className="mt-1 block pl-6 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {t(`methodDesc_${m}` as TKey)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Code prefix */}
          {config.method === 'code' && (
            <div>
              <SectionLabel hint={t('colPrefixHint')}>{t('colPrefix')}</SectionLabel>
              <div className="flex items-center gap-1.5">
                <input
                  value={config.prefix}
                  onChange={(e) => onChange({ prefix: e.target.value.toUpperCase().replace(/\s/g, '_') })}
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
              {!prefixOk && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t('prefixInvalid')}</p>}
              {sharedPrefix && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('sharedPrefix')}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <button type="button" className={cx(btnPrimary, 'w-full')} onClick={onClose}>
          {t('done')}
        </button>
      </div>
    </div>
  )
}
