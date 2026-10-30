import { useRef, useState } from 'react'
import { useI18n, type TKey } from '../i18n'
import { suggestPrefix } from '../lib/detectType'
import { baseName } from '../lib/fileName'
import type { PrefixStats } from '../lib/masker'
import type { ColumnConfig, MaskWarning } from '../lib/types'
import { useWorker } from '../useWorker'
import { confirmBigFile, downloadBlob, errorText, formatBytes, MIME } from '../util'
import type { MaskRequest, MaskResponse, WorkbookInfo, WorkerError } from '../workers/protocol'
import { ColumnSelector } from './ColumnSelector'
import { FileDropzone } from './FileDropzone'
import { DownloadIcon, FileIcon, KeyIcon } from './icons'
import { PreviewTable } from './PreviewTable'
import { Alert, btnPrimary, btnSecondary, Card, ProgressBar, StepTitle } from './ui'

type Stage = 'empty' | 'loading' | 'ready' | 'masking' | 'done'

interface MaskOutput {
  masked: ArrayBuffer
  format: 'xlsx' | 'csv'
  mappingJson: string
  stats: PrefixStats[]
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
      prefix: suggestPrefix(type, col.header, col.colIndex),
      moneyMode: 'multiply',
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

  const update = (key: string, patch: Partial<ColumnConfig>) => {
    setOutput(null)
    if (stage === 'done') setStage('ready')
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

  const setAll = (enabled: boolean) => {
    setOutput(null)
    if (stage === 'done') setStage('ready')
    setConfigs((prev) => Object.fromEntries(Object.entries(prev).map(([k, c]) => [k, { ...c, enabled }])))
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
    <div className="space-y-5">
      <Card>
        <StepTitle
          n={1}
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
          <div className="space-y-3">
            <FileDropzone accept={ACCEPT} title={t('dropTitle')} hint={t('dropHint')} onFile={onFile} disabled={stage === 'loading'} />
            <div className="flex justify-center">
              <button
                type="button"
                className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline disabled:opacity-50 dark:text-emerald-400"
                onClick={trySample}
                disabled={stage === 'loading'}
              >
                {t('trySample')}
              </button>
            </div>
            {stage === 'loading' && <ProgressBar pct={30} label={file?.name ?? ''} />}
          </div>
        ) : (
          info && (
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-600 dark:bg-slate-800 dark:text-slate-300">
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
            <StepTitle n={2}>{t('step2')}</StepTitle>
            <ColumnSelector
              columns={info.columns}
              configs={configs}
              onChange={update}
              onAll={setAll}
              showSheets={info.sheets.length > 1}
            />
            <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{t('preview')}</h3>
              <PreviewTable sheets={info.sheets} configs={configs} />
            </div>
            <div className="mt-6 space-y-3">
              {error && <Alert kind="error">{error}</Alert>}
              {stage === 'masking' ? (
                <ProgressBar pct={progress} label={t('processing', { pct: Math.round(progress) })} />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={btnPrimary} disabled={enabledCount === 0} onClick={mask}>
                    {t('maskButton')}
                  </button>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {enabledCount ? t('selectedCount', { n: enabledCount }) : t('noneSelected')}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {stage === 'done' && output && (
            <Card className="border-emerald-300 dark:border-emerald-800">
              <StepTitle n={3}>{t('step3')}</StepTitle>
              <div className="space-y-4">
                <Alert kind="success" title={t('doneTitle', { cells: output.maskedCells.toLocaleString() })} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div>
                      <p className="font-semibold">{t('downloadMasked')}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('downloadMaskedHint')}</p>
                      <p className="mt-1 font-mono text-xs break-all text-slate-500">
                        {base}_masked.{output.format}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={() => {
                        downloadBlob(output.masked, `${base}_masked.${output.format}`, MIME[output.format])
                        setDownloaded((d) => ({ ...d, masked: true }))
                      }}
                    >
                      <DownloadIcon /> {t('downloadMasked')}
                      {downloaded.masked && ' ✓'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/20">
                    <div>
                      <p className="flex items-center gap-1.5 font-semibold text-red-800 dark:text-red-200">
                        <KeyIcon /> {t('downloadMapping')}
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300">{t('mappingWarningTitle')}</p>
                      <p className="mt-1 font-mono text-xs break-all text-slate-500">{base}_mapping_PRIVATE.json</p>
                    </div>
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => {
                        downloadBlob(output.mappingJson, `${base}_mapping_PRIVATE.json`, MIME.json)
                        setDownloaded((d) => ({ ...d, mapping: true }))
                      }}
                    >
                      <DownloadIcon /> {t('downloadMapping')}
                      {downloaded.mapping && ' ✓'}
                    </button>
                  </div>
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
                            : t('warnMoney', { header: w.header, sheet: w.sheet, count: w.count })}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}

                {output.stats.length > 0 && (
                  <details className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <summary className="cursor-pointer font-medium">{t('statsTitle')}</summary>
                    <ul className="mt-2 space-y-0.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {output.stats.map((s) => (
                        <li key={s.prefix}>
                          {t('statsRow', { prefix: s.prefix, unique: s.unique.toLocaleString(), cells: s.cells.toLocaleString() })}
                        </li>
                      ))}
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
