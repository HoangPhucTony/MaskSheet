import type { ReactNode } from 'react'
import { useI18n, type TKey } from '../i18n'
import type { DictionaryStats } from '../lib/masker'
import type { MaskWarning } from '../lib/types'
import { cx, formatBytes } from '../util'
import { CheckIcon, DownloadIcon, KeyIcon, ShieldIcon } from './icons'
import { Hint } from './Tooltip'
import { Alert, btnPrimary, btnSecondary, Card } from './ui'

export interface MaskOutput {
  masked: ArrayBuffer
  format: 'xlsx' | 'csv'
  /** Mapping file as UTF-8 JSON. */
  mapping: ArrayBuffer
  stats: DictionaryStats[]
  warnings: MaskWarning[]
  maskedCells: number
}

export function ResultCard(props: {
  output: MaskOutput
  base: string
  /** Size of the original file; 0 = unknown. */
  originalSize: number
  downloaded: { masked: boolean; mapping: boolean }
  onDownloadMasked: () => void
  onDownloadMapping: () => void
  warningText: (w: MaskWarning) => string
  onFixWarning: (w: MaskWarning) => void
  /** Scroll back up to the grid. */
  onEdit: () => void
  onRestore: () => void
  onMaskAgain: () => void
}) {
  const { t } = useI18n()
  const { output, base, downloaded } = props
  return (
    <Card className="border-emerald-300 dark:border-emerald-800">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold tracking-tight">{t('doneTitle', { cells: output.maskedCells.toLocaleString() })}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('doneSubtitle')}</p>
          </div>
          <button type="button" className={btnSecondary} onClick={props.onEdit}>
            {t('editSelection')}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DownloadRow
            safe
            icon={<ShieldIcon />}
            title={t('downloadMasked')}
            subtitle={t('downloadMaskedHint')}
            tip={t('downloadMaskedTip')}
            fileName={`${base}_masked.${output.format}`}
            size={
              formatBytes(output.masked.byteLength) +
              (props.originalSize ? ` (${t('originalSize', { size: formatBytes(props.originalSize) })})` : '')
            }
            label={t('download')}
            doneLabel={t('downloadedLabel')}
            done={downloaded.masked}
            onDownload={props.onDownloadMasked}
          />
          <DownloadRow
            safe={false}
            icon={<KeyIcon />}
            title={t('downloadMapping')}
            subtitle={t('downloadMappingHint')}
            tip={t('downloadMappingTip')}
            fileName={`${base}_mapping_PRIVATE.json`}
            size={formatBytes(output.mapping.byteLength)}
            label={t('download')}
            doneLabel={t('downloadedLabel')}
            done={downloaded.mapping}
            onDownload={props.onDownloadMapping}
          />
        </div>

        <Alert kind="danger" title={t('mappingWarningTitle')}>
          {t('mappingWarning')}
        </Alert>

        {output.warnings.length > 0 && (
          <Alert kind="warn" title={t('warningsTitle')}>
            <ul className="list-disc space-y-0.5 pl-4">
              {output.warnings.map((w, i) => (
                <li key={i}>
                  {props.warningText(w)}
                  {w.column && (
                    <button
                      type="button"
                      data-column-chip
                      className="ml-2 rounded-md bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-amber-700"
                      onClick={() => props.onFixWarning(w)}
                    >
                      {w.kind === 'skipped' ? t('warnOpenColumn') : t('warnFixColumn')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {output.stats.length > 0 && (
          <details className="rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-800">
            <summary className="cursor-pointer font-medium">{t('statsTitle')}</summary>
            <ul className="mt-2 space-y-0.5 font-mono text-xs text-slate-600 dark:text-slate-400">
              {output.stats.map((s) => {
                const vars = {
                  key: s.key,
                  type: t(`type_${s.type}` as TKey),
                  unique: s.unique.toLocaleString(),
                  cells: s.cells.toLocaleString(),
                }
                return <li key={s.key}>{s.method === 'fake' ? t('statsFake', vars) : t('statsCode', vars)}</li>
              })}
            </ul>
          </details>
        )}

        {output.format === 'xlsx' && <p className="text-xs text-slate-500 dark:text-slate-400">{t('formatNote')}</p>}

        {/* Next step */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300">{t('nextStepHint')}</p>
          <button type="button" className={btnPrimary} onClick={props.onRestore}>
            {t('restoreNow')}
          </button>
          <button type="button" className={btnSecondary} onClick={props.onMaskAgain}>
            {t('maskAgain')}
          </button>
        </div>
      </div>
    </Card>
  )
}

function DownloadRow(props: {
  safe: boolean
  icon: ReactNode
  title: string
  subtitle: string
  tip: string
  fileName: string
  /** File size, shown before downloading. */
  size: string
  label: string
  doneLabel: string
  done: boolean
  onDownload: () => void
}) {
  const { safe, done } = props
  return (
    <div
      className={cx(
        'flex flex-col gap-3 rounded-2xl border bg-gradient-to-br to-white p-4 dark:to-slate-900',
        safe
          ? 'border-emerald-200 from-emerald-50 dark:border-emerald-900 dark:from-emerald-950/40'
          : 'border-rose-200 from-rose-50 dark:border-rose-900 dark:from-rose-950/30',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            'flex size-9 shrink-0 items-center justify-center rounded-xl text-lg text-white',
            safe ? 'bg-emerald-600' : 'bg-rose-600',
          )}
        >
          {props.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-semibold">
            {props.title} <Hint text={props.tip} align="end" />
          </p>
          <p className={cx('text-sm', safe ? 'text-emerald-800 dark:text-emerald-300' : 'font-medium text-rose-700 dark:text-rose-300')}>
            {props.subtitle}
          </p>
          <p className="mt-1 font-mono text-xs break-all text-slate-500">{props.fileName}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{props.size}</p>
        </div>
      </div>
      <button
        type="button"
        className={cx(
          done
            ? btnSecondary
            : safe
              ? btnPrimary
              : 'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600',
        )}
        onClick={props.onDownload}
      >
        {done ? (
          <>
            <CheckIcon /> {props.doneLabel}
          </>
        ) : (
          <>
            <DownloadIcon /> {props.label}
          </>
        )}
      </button>
    </div>
  )
}
