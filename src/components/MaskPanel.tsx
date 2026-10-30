import { useRef, useState, type ReactNode } from 'react'
import { useI18n, type TKey } from '../i18n'
import { suggestPrefix } from '../lib/detectType'
import { baseName } from '../lib/fileName'
import type { DictionaryStats } from '../lib/masker'
import type { ColumnConfig, MaskWarning } from '../lib/types'
import { useWorker } from '../useWorker'
import { confirmBigFile, cx, downloadBlob, errorText, formatBytes, MIME } from '../util'
import type { MaskRequest, MaskResponse, WorkbookInfo, WorkerError } from '../workers/protocol'
import { ColumnSelector, methodsFor } from './ColumnSelector'
import { FileDropzone } from './FileDropzone'
import { CheckIcon, DownloadIcon, FileIcon, KeyIcon, ShieldIcon, SparkIcon } from './icons'
import { PreviewTable } from './PreviewTable'
import { Hint, Tooltip } from './Tooltip'
import { Alert, btnPrimary, btnSecondary, Card, ProgressBar, StepTitle } from './ui'

type Stage = 'empty' | 'loading' | 'ready' | 'masking' | 'done'

interface MaskOutput {
  masked: ArrayBuffer
  format: 'xlsx' | 'csv'
  mappingJson: string
  stats: DictionaryStats[]
  warnings: MaskWarning[]
  maskedCells: number
}

const ACCEPT = '.xlsx,.xls,.csv,.tsv,.txt'

function initialConfigs(info: WorkbookInfo): Record<string, ColumnConfig> {
  const configs: Record<string, ColumnConfig> = {}
  for (const col of info.columns) {
    const type = col.suggestion?.type ?? 'custom'
    configs[col.key] = {
      key: col.key,
      header: col.header,
      enabled: false,
      type,
      method: methodsFor(type)[0],
      prefix: suggestPrefix(type, col.header, col.colIndex),
    }
  }
  return configs
}

export function MaskPanel() {
  const { t } = useI18n()
  const [stage, setStage] = useState<Stage>('empty')
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const [info, setInfo] = useState<WorkbookInfo | null>(null)
  const [configs, setConfigs] = useState<Record<string, ColumnConfig>>({})
  const [touchedPrefix, setTouchedPrefix] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<MaskOutput | null>(null)
  const [downloaded, setDownloaded] = useState({ masked: false, mapping: false })
  const stageRef = useRef(stage)
  stageRef.current = stage

  const fail = (err: WorkerError, back: Stage) => {
    setError(errorText(t, err))
    setStage(back)
  }

  const post = useWorker<MaskRequest, MaskResponse>(
    () => new Worker(new URL('../workers/mask.worker.ts', import.meta.url), { type: 'module' }),
    (msg) => {
      switch (msg.type) {
        case 'loaded':
          setInfo(msg.info)
          setConfigs(initialConfigs(msg.info))
          setTouchedPrefix(new Set())
          setStage('ready')
          break
        case 'progress':
          setProgress((msg.done / Math.max(1, msg.total)) * 100)
          break
        case 'masked':
          setOutput(msg)
          setDownloaded({ masked: false, mapping: false })
          setStage('done')
          break
        case 'error':
          fail(msg, stageRef.current === 'loading' ? 'empty' : 'ready')
          break
      }
    },
    () => {
      setError(t('err_worker_crashed'))
      setInfo(null)
      setStage('empty')
    },
  )

  const load = async (name: string, size: number, getBuffer: () => Promise<ArrayBuffer>) => {
    setError(null)
    setOutput(null)
    setFile({ name, size })
    setStage('loading')
    try {
      const buffer = await getBuffer()
      post({ type: 'load', buffer, fileName: name }, [buffer])
    } catch (err) {
      setError(errorText(t, { code: 'read-failed', details: [String(err)] }))
      setStage('empty')
    }
  }

  const onFile = (f: File) => {
    if (/\.json$/i.test(f.name)) {
      setError(t('err_read_failed'))
      return
    }
    if (!confirmBigFile(t, f)) return
    void load(f.name, f.size, () => f.arrayBuffer())
  }

  const trySample = () =>
    void load('sample.xlsx', 0, async () => {
      const res = await fetch('./sample.xlsx')
      if (!res.ok) throw new Error(res.statusText)
      return res.arrayBuffer()
    })

  const invalidateOutput = () => {
    setOutput(null)
    if (stage === 'done') setStage('ready')
  }

  const update = (key: string, patch: Partial<ColumnConfig>) => {
    invalidateOutput()
    if (patch.prefix !== undefined) setTouchedPrefix((s) => new Set(s).add(key))
    setConfigs((prev) => {
      const cur = prev[key]
      const next = { ...cur, ...patch }
      if (patch.type && patch.type !== cur.type && !touchedPrefix.has(key)) {
        const col = info!.columns.find((c) => c.key === key)!
        next.prefix = suggestPrefix(patch.type, col.header, col.colIndex)
      }
      return { ...prev, [key]: next }
    })
  }

  const setEnabled = (isOn: (key: string) => boolean) => {
    invalidateOutput()
    setConfigs((prev) => Object.fromEntries(Object.entries(prev).map(([k, c]) => [k, { ...c, enabled: isOn(k) }])))
  }

  const selectSuggested = () => {
    const suggested = new Set(info?.columns.filter((c) => c.suggestion).map((c) => c.key))
    setEnabled((k) => suggested.has(k))
  }

  const mask = () => {
    setError(null)
    setProgress(0)
    setStage('masking')
    post({ type: 'mask', configs: Object.values(configs) })
  }

  const reset = () => {
    setStage('empty')
    setInfo(null)
    setFile(null)
    setOutput(null)
    setError(null)
  }

  const enabledCount = Object.values(configs).filter((c) => c.enabled).length
  const totalRows = info?.sheets.reduce((n, s) => n + s.rowCount, 0) ?? 0
  const base = info ? baseName(info.fileName) : ''

  return (
    <div className="space-y-6">
      <Card>
        <StepTitle
          n={1}
          hint={t('step1Hint')}
          aside={
            info && (
              <button type="button" className={btnSecondary} onClick={reset}>
                {t('changeFile')}
              </button>
            )
          }
        >
          {t('step1')}
        </StepTitle>
        {stage === 'empty' || stage === 'loading' ? (
          <div className="space-y-4">
            <FileDropzone accept={ACCEPT} title={t('dropTitle')} hint={t('dropHint')} onFile={onFile} disabled={stage === 'loading'} />
            <div className="flex justify-center">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950"
                onClick={trySample}
                disabled={stage === 'loading'}
              >
                <SparkIcon /> {t('trySample')}
              </button>
            </div>
            {stage === 'loading' && <ProgressBar pct={30} label={file?.name ?? ''} />}
          </div>
        ) : (
          info && (
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <span className="flex size-11 items-center justify-center rounded-xl bg-white text-xl text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400">
                <FileIcon />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{info.fileName}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('sheetsInfo', { sheets: info.sheets.length, rows: totalRows.toLocaleString() })}
                  {file && file.size > 0 && ` · ${formatBytes(file.size)}`}
                </p>
              </div>
            </div>
          )
        )}
        {error && (stage === 'empty' || stage === 'loading') && (
          <div className="mt-4">
            <Alert kind="error">{error}</Alert>
          </div>
        )}
      </Card>

      {info && stage !== 'empty' && stage !== 'loading' && (
        <>
          <Card>
            <StepTitle n={2} hint={t('step2Hint')}>
              {t('step2')}
            </StepTitle>
            <ColumnSelector
              columns={info.columns}
              configs={configs}
              onChange={update}
              onAll={(on) => setEnabled(() => on)}
              onSuggested={selectSuggested}
              showSheets={info.sheets.length > 1}
            />
            <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                {t('preview')} <Hint text={t('previewHint')} align="start" />
              </h3>
              <PreviewTable sheets={info.sheets} configs={configs} />
            </div>
            <div className="sticky bottom-3 z-20 mt-6 space-y-3">
              {error && <Alert kind="error">{error}</Alert>}
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lg shadow-slate-900/5 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
                {stage === 'masking' ? (
                  <ProgressBar pct={progress} label={t('processing', { pct: Math.round(progress) })} />
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Tooltip content={t('maskButtonHint')} align="start">
                      <button type="button" className={btnPrimary} disabled={enabledCount === 0} onClick={mask}>
                        <ShieldIcon /> {t('maskButton')}
                      </button>
                    </Tooltip>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {enabledCount ? t('selectedCount', { n: enabledCount }) : t('noneSelected')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {stage === 'done' && output && (
            <Card className="border-emerald-300 dark:border-emerald-800">
              <StepTitle n={3} hint={t('step3Hint')}>
                {t('step3')}
              </StepTitle>
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-lg text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckIcon />
                  </span>
                  <div>
                    <p className="font-semibold">{t('doneTitle', { cells: output.maskedCells.toLocaleString() })}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('doneSubtitle')}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <DownloadCard
                    safe
                    icon={<ShieldIcon />}
                    title={t('downloadMasked')}
                    subtitle={t('downloadMaskedHint')}
                    tip={t('downloadMaskedTip')}
                    fileName={`${base}_masked.${output.format}`}
                    label={t('download')}
                    done={downloaded.masked}
                    onDownload={() => {
                      downloadBlob(output.masked, `${base}_masked.${output.format}`, MIME[output.format])
                      setDownloaded((d) => ({ ...d, masked: true }))
                    }}
                  />
                  <DownloadCard
                    safe={false}
                    icon={<KeyIcon />}
                    title={t('downloadMapping')}
                    subtitle={t('downloadMappingHint')}
                    tip={t('downloadMappingTip')}
                    fileName={`${base}_mapping_PRIVATE.json`}
                    label={t('download')}
                    done={downloaded.mapping}
                    onDownload={() => {
                      downloadBlob(output.mappingJson, `${base}_mapping_PRIVATE.json`, MIME.json)
                      setDownloaded((d) => ({ ...d, mapping: true }))
                    }}
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
                          {w.kind === 'pii-unmasked'
                            ? t('warnPii', { header: w.header, sheet: w.sheet, count: w.count, detail: t(`detail_${w.detail}` as TKey) })
                            : t(`warnSkipped_${w.detail}` as TKey, { header: w.header, sheet: w.sheet, count: w.count })}
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

                <button type="button" className={btnSecondary} onClick={reset}>
                  {t('maskAgain')}
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function DownloadCard(props: {
  safe: boolean
  icon: ReactNode
  title: string
  subtitle: string
  tip: string
  fileName: string
  label: string
  done: boolean
  onDownload: () => void
}) {
  const { safe } = props
  return (
    <div
      className={cx(
        'flex flex-col gap-4 rounded-2xl border bg-gradient-to-br to-white p-5 dark:to-slate-900',
        safe
          ? 'border-emerald-200 from-emerald-50 dark:border-emerald-900 dark:from-emerald-950/40'
          : 'border-rose-200 from-rose-50 dark:border-rose-900 dark:from-rose-950/30',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            'flex size-10 shrink-0 items-center justify-center rounded-xl text-lg text-white',
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
        </div>
      </div>
      <button type="button" className={safe ? btnPrimary : btnSecondary} onClick={props.onDownload}>
        {props.done ? <CheckIcon /> : <DownloadIcon />} {props.label}
      </button>
    </div>
  )
}
