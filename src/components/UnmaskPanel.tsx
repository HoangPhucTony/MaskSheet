import { useState } from 'react'
import { useI18n } from '../i18n'
import { baseName } from '../lib/fileName'
import { parseMapping, type MappingFile } from '../lib/mapping'
import { divideBack, parseNumber } from '../lib/money'
import type { UnmaskStats } from '../lib/unmasker'
import { useWorker } from '../useWorker'
import { confirmBigFile, cx, downloadBlob, errorText, MIME } from '../util'
import type { UnmaskRequest, UnmaskResponse } from '../workers/protocol'
import { FileDropzone } from './FileDropzone'
import { CopyIcon, DownloadIcon, FileIcon, KeyIcon, XIcon } from './icons'
import { Alert, btnGhost, btnPrimary, btnSecondary, Card, inputBase, ProgressBar, StepTitle } from './ui'

interface LoadedMapping {
  fileName: string
  json: string
  data: MappingFile
}

type Source = 'text' | 'file'

type Result =
  | { kind: 'text'; text: string; stats: UnmaskStats }
  | { kind: 'file'; buffer: ArrayBuffer; format: 'xlsx' | 'csv'; fileName: string; stats: UnmaskStats }

export function UnmaskPanel() {
  const { t, lang } = useI18n()
  const [mapping, setMapping] = useState<LoadedMapping | null>(null)
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [source, setSource] = useState<Source>('text')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [pendingFile, setPendingFile] = useState<string>('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const post = useWorker<UnmaskRequest, UnmaskResponse>(
    () => new Worker(new URL('../workers/unmask.worker.ts', import.meta.url), { type: 'module' }),
    (msg) => {
      switch (msg.type) {
        case 'progress':
          setProgress((msg.done / Math.max(1, msg.total)) * 100)
          break
        case 'unmasked-text':
          setResult({ kind: 'text', text: msg.text, stats: msg.stats })
          setBusy(false)
          break
        case 'unmasked-file':
          setResult({ kind: 'file', buffer: msg.buffer, format: msg.format, fileName: pendingFile, stats: msg.stats })
          setBusy(false)
          break
        case 'error':
          setError(errorText(t, msg))
          setBusy(false)
          break
      }
    },
    () => {
      setError(t('err_worker_crashed'))
      setBusy(false)
    },
  )

  const loadMapping = async (file: File) => {
    setMappingError(null)
    setResult(null)
    try {
      const json = await file.text()
      setMapping({ fileName: file.name, json, data: parseMapping(json) })
    } catch {
      setMapping(null)
      setMappingError(t('err_mapping'))
    }
  }

  const runText = () => {
    if (!mapping) return
    setError(null)
    setResult(null)
    setCopied(false)
    setBusy(true)
    post({ type: 'unmask-text', text, mappingJson: mapping.json })
  }

  const runFile = async (file: File) => {
    if (!mapping) return
    if (/\.json$/i.test(file.name)) {
      setError(t('err_wrong_file_json'))
      return
    }
    if (!confirmBigFile(t, file)) return
    setError(null)
    setResult(null)
    setProgress(0)
    setBusy(true)
    setPendingFile(file.name)
    const buffer = await file.arrayBuffer()
    post({ type: 'unmask-file', buffer, fileName: file.name, mappingJson: mapping.json }, [buffer])
  }

  const copy = async () => {
    if (result?.kind !== 'text') return
    try {
      await navigator.clipboard.writeText(result.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked; the text is still selectable
    }
  }

  const codeCount = mapping ? Object.values(mapping.data.dictionaries).reduce((n, d) => n + d.entries.length, 0) : 0
  const money = mapping?.data.money

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600 dark:text-slate-400">{t('unmaskIntro')}</p>

      <Card>
        <StepTitle n={1}>{t('dropMappingTitle')}</StepTitle>
        {mapping ? (
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-xl text-red-700 dark:bg-red-950/50 dark:text-red-300">
              <KeyIcon />
            </span>
            <p className="min-w-0 flex-1 text-sm break-words">
              {t('mappingLoaded', {
                file: mapping.data.sourceFile,
                codes: codeCount.toLocaleString(),
                date: new Date(mapping.data.createdAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB'),
              })}
            </p>
            <button type="button" className={btnGhost} aria-label="Remove" onClick={() => setMapping(null)}>
              <XIcon />
            </button>
          </div>
        ) : (
          <FileDropzone
            compact
            accept=".json,application/json"
            title={t('dropMappingTitle')}
            hint={t('dropMappingHint')}
            icon={<KeyIcon />}
            onFile={loadMapping}
          />
        )}
        {mappingError && (
          <div className="mt-3">
            <Alert kind="error">{mappingError}</Alert>
          </div>
        )}
      </Card>

      <Card className={cx(!mapping && 'pointer-events-none opacity-50')}>
        <StepTitle n={2}>{t('resultSource')}</StepTitle>
        <div role="tablist" className="mb-4 inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {(['text', 'file'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={source === s}
              onClick={() => {
                setSource(s)
                setResult(null)
                setError(null)
              }}
              className={cx(
                'rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
                source === s
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
              )}
            >
              {s === 'text' ? t('sourceText') : t('sourceFile')}
            </button>
          ))}
        </div>

        {source === 'text' ? (
          <div className="space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('textPlaceholder')}
              rows={8}
              disabled={!mapping}
              className={cx(inputBase, 'block w-full resize-y font-mono text-[13px] leading-relaxed')}
            />
            <button type="button" className={btnPrimary} disabled={!mapping || !text.trim() || busy} onClick={runText}>
              {t('unmaskButton')}
            </button>
          </div>
        ) : (
          <FileDropzone
            compact
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            title={t('dropResultTitle')}
            hint={t('dropHint')}
            icon={<FileIcon />}
            onFile={(f) => void runFile(f)}
            disabled={!mapping || busy}
          />
        )}

        <div className="mt-4 space-y-3">
          {busy && source === 'file' && <ProgressBar pct={progress} label={t('processing', { pct: Math.round(progress) })} />}
          {error && <Alert kind="error">{error}</Alert>}
          {result && (
            <>
              <Alert kind="success" title={t('restoredTitle', { n: result.stats.replaced.toLocaleString() })}>
                {result.stats.divided > 0 && <p>{t('dividedCells', { n: result.stats.divided.toLocaleString() })}</p>}
              </Alert>
              {result.stats.unknown.length > 0 && (
                <Alert kind="warn">
                  {t('unknownCodes', {
                    n: result.stats.unknown.length,
                    codes: result.stats.unknown.slice(0, 10).join(', ') + (result.stats.unknown.length > 10 ? '…' : ''),
                  })}
                </Alert>
              )}
              {result.kind === 'text' ? (
                <div className="space-y-2">
                  <textarea
                    readOnly
                    value={result.text}
                    rows={10}
                    className={cx(inputBase, 'block w-full resize-y bg-slate-50 font-mono text-[13px] leading-relaxed dark:bg-slate-950')}
                  />
                  <button type="button" className={btnSecondary} onClick={() => void copy()}>
                    <CopyIcon /> {copied ? t('copied') : t('copy')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() =>
                    downloadBlob(result.buffer, `${baseName(result.fileName)}_restored.${result.format}`, MIME[result.format])
                  }
                >
                  <DownloadIcon /> {t('downloadRestored')}
                </button>
              )}
            </>
          )}
        </div>
      </Card>

      {money && (money.multipliedHeaders.length > 0 || money.roundedHeaders.length > 0) && (
        <MoneyConverter factor={money.multipliedHeaders.length > 0 ? money.factor : null} rounded={money.roundedHeaders} />
      )}
    </div>
  )
}

function MoneyConverter({ factor, rounded }: { factor: number | null; rounded: string[] }) {
  const { t, lang } = useI18n()
  const [value, setValue] = useState('')
  const parsed = parseNumber(value)
  const real = factor && parsed !== null ? divideBack(parsed, factor) : null

  return (
    <Card>
      <h2 className="mb-2 text-base font-semibold">{t('moneyFactorTitle')}</h2>
      {factor && (
        <>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{t('moneyFactorHelp')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('moneyFactorInput')}</span>
              <input
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={cx(inputBase, 'block w-full font-mono')}
                placeholder="123456789"
              />
            </label>
            <div className="space-y-1 text-sm">
              <span className="font-medium">{t('moneyFactorResult')}</span>
              <output className="block rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-mono font-semibold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                {real === null ? '—' : real.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 })}
              </output>
            </div>
          </div>
        </>
      )}
      {rounded.length > 0 && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('moneyRoundedNote', { cols: rounded.join(', ') })}</p>
      )}
    </Card>
  )
}
