import { useState } from 'react'
import { useI18n } from '../i18n'
import { baseName } from '../lib/fileName'
import { parseMapping, type MappingFile } from '../lib/mapping'
import { parseTextDate, shiftTextDate } from '../lib/dates'
import { divideBack, parseNumber } from '../lib/money'
import type { UnmaskStats } from '../lib/unmasker'
import { useWorker } from '../useWorker'
import { confirmBigFile, cx, downloadBlob, errorText, formatBytes, MIME } from '../util'
import type { UnmaskRequest, UnmaskResponse } from '../workers/protocol'
import { FileDropzone } from './FileDropzone'
import { CopyIcon, DownloadIcon, FileIcon, KeyIcon, XIcon } from './icons'
import { Hint } from './Tooltip'
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
  const factor = mapping?.data.money?.factor ?? null
  const offsetDays = mapping?.data.dates?.offsetDays ?? null

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600 dark:text-slate-400">{t('unmaskIntro')}</p>

      <Card>
        <StepTitle n={1} hint={t('unmaskStep1Hint')}>
          {t('dropMappingTitle')}
        </StepTitle>
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
        <StepTitle n={2} hint={t('resultSourceHint')}>
          {t('resultSource')}
        </StepTitle>
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
                  ? 'bg-emerald-600 text-white shadow-sm'
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
                {result.stats.shifted > 0 && <p>{t('shiftedCells', { n: result.stats.shifted.toLocaleString() })}</p>}
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
                  <span className="font-normal opacity-80">· {formatBytes(result.buffer.byteLength)}</span>
                </button>
              )}
            </>
          )}
        </div>
      </Card>

      {(factor !== null || offsetDays !== null) && <ConvertTools factor={factor} offsetDays={offsetDays} />}
    </div>
  )
}

function ConvertTools({ factor, offsetDays }: { factor: number | null; offsetDays: number | null }) {
  const { t, lang } = useI18n()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const parsed = parseNumber(amount)
  const realAmount = factor !== null && parsed !== null ? divideBack(parsed, factor) : null
  const realDate = offsetDays !== null && parseTextDate(date) ? shiftTextDate(date, -offsetDays) : null

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, result: string | null) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm">
        <span className="font-medium">{label}</span>
        <input
          value={value}
          onChange={(e) => set(e.target.value)}
          className={cx(inputBase, 'block w-full font-mono')}
          placeholder={placeholder}
        />
      </label>
      <div className="space-y-1.5 text-sm">
        <span className="font-medium">{t('realValue')}</span>
        <output className="block rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 font-mono font-semibold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {result ?? '—'}
        </output>
      </div>
    </div>
  )

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-1.5 text-lg font-semibold tracking-tight">
        {t('toolsTitle')} <Hint text={t('toolsHint')} align="start" />
      </h2>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">{t('toolsHint')}</p>
      <div className="space-y-5">
        {factor !== null &&
          field(
            t('moneyFactorInput'),
            amount,
            setAmount,
            '3,311,000',
            realAmount === null ? null : realAmount.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 }),
          )}
        {offsetDays !== null && field(t('dateInput'), date, setDate, '15/11/2026', realDate)}
      </div>
    </Card>
  )
}
