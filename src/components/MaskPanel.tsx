import { useRef, useState, type ReactNode } from 'react'
import { useI18n, type TKey } from '../i18n'
import { suggestPrefix } from '../lib/detectType'
import { methodsFor } from '../lib/fake'
import { baseName } from '../lib/fileName'
import type { DictionaryStats } from '../lib/masker'
import type { ColumnConfig, MaskWarning } from '../lib/types'
import { useWorker } from '../useWorker'
import { confirmBigFile, cx, downloadBlob, errorText, formatBytes, MIME } from '../util'
import type { MaskRequest, MaskResponse, WorkbookInfo, WorkerError } from '../workers/protocol'
import { ColumnGrid } from './ColumnGrid'
import { ColumnInspector } from './ColumnInspector'
import { FileDropzone } from './FileDropzone'
import { CheckIcon, DownloadIcon, FileIcon, KeyIcon, ShieldIcon, SparkIcon, WandIcon, XIcon } from './icons'
import { Hint, Tooltip } from './Tooltip'
import { TYPE_ICON } from './typeMeta'
import { Alert, btnGhost, btnPrimary, btnSecondary, Card, ProgressBar } from './ui'

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

function Stepper({ current }: { current: number }) {
  const { t } = useI18n()
  const steps: [string, string][] = [
    [t('step1'), t('step1Hint')],
    [t('step2'), t('step2Hint')],
    [t('step3'), t('step3Hint')],
  ]
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {steps.map(([label, hint], i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={i} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Tooltip content={hint} side="bottom" align={i === 0 ? 'start' : i === 2 ? 'end' : 'center'} className="min-w-0">
              <span tabIndex={0} className="flex min-w-0 cursor-help items-center gap-2">
                <span
                  className={cx(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition',
                    done && 'bg-emerald-600 text-white',
                    active && 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/30 ring-4 ring-emerald-500/15',
                    !done && !active && 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                  )}
                >
                  {done ? <CheckIcon /> : i + 1}
                </span>
                <span
                  className={cx(
                    'truncate text-sm font-semibold',
                    active ? 'text-slate-900 dark:text-white' : 'hidden text-slate-500 sm:inline dark:text-slate-400',
                  )}
                >
                  {label}
                </span>
              </span>
            </Tooltip>
            {i < steps.length - 1 && (
              <span className={cx('h-0.5 min-w-4 flex-1 rounded-full', done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800')} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function MaskPanel() {
  const { t } = useI18n()
  const [stage, setStage] = useState<Stage>('empty')
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const [info, setInfo] = useState<WorkbookInfo | null>(null)
  const [configs, setConfigs] = useState<Record<string, ColumnConfig>>({})
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [touchedPrefix, setTouchedPrefix] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<MaskOutput | null>(null)
  const [downloaded, setDownloaded] = useState({ masked: false, mapping: false })
  const stageRef = useRef(stage)
  stageRef.current = stage
  const resultRef = useRef<HTMLDivElement>(null)

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
          setActiveKey(null)
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
          setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
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

  /** Click on a column: select + focus it; clicking the focused column again toggles it. */
  const pick = (key: string) => {
    const cfg = configs[key]
    if (key === activeKey) update(key, { enabled: !cfg.enabled })
    else if (!cfg.enabled) update(key, { enabled: true })
    setActiveKey(key)
  }

  const setEnabled = (isOn: (key: string) => boolean) => {
    invalidateOutput()
    setConfigs((prev) => Object.fromEntries(Object.entries(prev).map(([k, c]) => [k, { ...c, enabled: isOn(k) }])))
  }

  const selectSuggested = () => {
    const suggested = info?.columns.filter((c) => c.suggestion).map((c) => c.key) ?? []
    setEnabled((k) => suggested.includes(k))
    if (suggested.length) setActiveKey(suggested[0])
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
    setActiveKey(null)
  }

  const selected = info ? info.columns.filter((c) => configs[c.key]?.enabled) : []
  const totalRows = info?.sheets.reduce((n, s) => n + s.rowCount, 0) ?? 0
  const base = info ? baseName(info.fileName) : ''
  const activeColumn = info?.columns.find((c) => c.key === activeKey) ?? null
  const prefixUse = (prefix: string) =>
    Object.values(configs).filter((c) => c.enabled && c.method === 'code' && c.prefix === prefix).length
  const step = stage === 'done' ? 2 : info && stage !== 'empty' && stage !== 'loading' ? 1 : 0

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/60">
        <Stepper current={step} />
      </div>

      {/* Step 1: choose a file */}
      {(stage === 'empty' || stage === 'loading' || !info) && (
        <Card>
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
            {error && <Alert kind="error">{error}</Alert>}
          </div>
        </Card>
      )}

      {/* Step 2: pick columns on the spreadsheet */}
      {info && stage !== 'empty' && stage !== 'loading' && (
        <>
          <Card className="!p-0">
            {/* File bar */}
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <FileIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{info.fileName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('sheetsInfo', { sheets: info.sheets.length, rows: totalRows.toLocaleString() })}
                  {file && file.size > 0 && ` · ${formatBytes(file.size)}`}
                </p>
              </div>
              <button type="button" className={btnSecondary} onClick={reset}>
                {t('changeFile')}
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    ☝
                  </span>
                  {t('gridHelpShort')}
                  <Hint text={t('gridHelp')} align="start" />
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  {info.columns.some((c) => c.suggestion) && (
                    <Tooltip content={t('selectSuggestedHint')} align="end">
                      <button type="button" className={cx(btnGhost, 'text-emerald-700 dark:text-emerald-400')} onClick={selectSuggested}>
                        <WandIcon /> {t('selectSuggested')}
                      </button>
                    </Tooltip>
                  )}
                  <button type="button" className={btnGhost} onClick={() => setEnabled(() => true)}>
                    {t('selectAll')}
                  </button>
                  <button type="button" className={btnGhost} onClick={() => setEnabled(() => false)}>
                    {t('selectNone')}
                  </button>
                  <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" />
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
                    {([false, true] as const).map((orig) => (
                      <button
                        key={String(orig)}
                        type="button"
                        aria-pressed={showOriginal === orig}
                        onClick={() => setShowOriginal(orig)}
                        className={cx(
                          'rounded-md px-2.5 py-1 font-semibold transition',
                          showOriginal === orig
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white',
                        )}
                      >
                        {orig ? t('viewOriginal') : t('viewAi')}
                      </button>
                    ))}
                  </div>
                  <Hint text={t('viewHint')} align="end" />
                </div>
              </div>

              <ColumnGrid
                sheets={info.sheets}
                columns={info.columns}
                configs={configs}
                activeKey={activeKey}
                onPick={pick}
                showOriginal={showOriginal}
              />

              {/* Selected columns as chips */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  {t('selectedColumns')} ({selected.length})
                </span>
                {selected.length === 0 && <span className="text-sm text-slate-400">{t('selectedNone')}</span>}
                {selected.map((c) => {
                  const cfg = configs[c.key]
                  const active = c.key === activeKey
                  return (
                    <span
                      key={c.key}
                      className={cx(
                        'inline-flex items-center overflow-hidden rounded-full border text-xs font-medium transition',
                        active
                          ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
                      )}
                    >
                      <button type="button" className="inline-flex items-center gap-1.5 py-1 pr-1 pl-2.5" onClick={() => setActiveKey(c.key)}>
                        <span aria-hidden="true">{TYPE_ICON[cfg.type]}</span>
                        <span className="max-w-[10rem] truncate">{c.header || '—'}</span>
                        <span className="opacity-70">· {t(`method_${cfg.method}` as TKey)}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={t('removeColumn')}
                        title={t('removeColumn')}
                        className="flex h-full items-center px-2 py-1 opacity-70 transition hover:opacity-100"
                        onClick={() => update(c.key, { enabled: false })}
                      >
                        <XIcon />
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Inspector for the focused column */}
            <div className="border-t border-slate-200 bg-slate-50/60 p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-950/40">
              {activeColumn ? (
                <ColumnInspector
                  key={activeColumn.key}
                  column={activeColumn}
                  config={configs[activeColumn.key]}
                  sharedPrefix={prefixUse(configs[activeColumn.key].prefix) > 1}
                  onChange={(patch) => update(activeColumn.key, patch)}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm dark:bg-slate-900">👆</span>
                  <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{t('inspectorEmpty')}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Sticky action bar */}
          <div className="sticky bottom-3 z-30 space-y-3">
            {error && <Alert kind="error">{error}</Alert>}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-lg dark:border-slate-700 dark:bg-slate-900/90">
              {stage === 'masking' ? (
                <div className="flex-1">
                  <ProgressBar pct={progress} label={t('processing', { pct: Math.round(progress) })} />
                </div>
              ) : (
                <>
                  <Tooltip content={t('maskButtonHint')} align="start">
                    <button type="button" className={btnPrimary} disabled={selected.length === 0} onClick={mask}>
                      <ShieldIcon /> {t('maskButton')}
                    </button>
                  </Tooltip>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {selected.length ? t('selectedCount', { n: selected.length }) : t('noneSelected')}
                  </span>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Step 3: download */}
      {stage === 'done' && output && (
        <div ref={resultRef} className="scroll-mt-24">
          <Card className="border-emerald-300 dark:border-emerald-800">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckIcon />
                </span>
                <div>
                  <p className="text-lg font-bold tracking-tight">{t('doneTitle', { cells: output.maskedCells.toLocaleString() })}</p>
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
        </div>
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
