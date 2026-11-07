import { useEffect, useRef, useState } from 'react'
import { useI18n, type TKey } from '../i18n'
import { suggestPrefix } from '../lib/detectType'
import { methodsFor } from '../lib/fake'
import { baseName } from '../lib/fileName'
import { isUsablePrefix } from '../lib/normalize'
import {
  applyTemplate,
  bestTemplate,
  loadSavedTemplates,
  makeTemplate,
  parseTemplate,
  storeTemplates,
  withTemplate,
  type Template,
  type TemplateResult,
} from '../lib/template'
import type { ColumnConfig, MaskWarning } from '../lib/types'
import { useWorker } from '../useWorker'
import { confirmBigFile, confirmDiscardMapping, cx, downloadBlob, errorText, formatBytes, MIME, SHEET_ACCEPT } from '../util'
import {
  PREVIEW_PAGE,
  type ColumnInfo,
  type MaskCommand,
  type MaskRequest,
  type MaskResponse,
  type Progress,
  type SheetInfo,
  type WorkbookInfo,
  type WorkerError,
} from '../workers/protocol'
import { ColumnGrid } from './ColumnGrid'
import { ColumnInspector } from './ColumnInspector'
import { Popover } from './Popover'
import { FileDropzone } from './FileDropzone'
import { BookmarkIcon, CheckIcon, FileIcon, SparkIcon, WandIcon } from './icons'
import { ResultCard, type MaskOutput } from './ResultCard'
import { SelectionBar } from './SelectionBar'
import { TemplatePicker, TemplateSaver } from './Templates'
import { Hint, Tooltip } from './Tooltip'
import { Alert, btnGhost, btnSecondary, Card, ProgressBar } from './ui'

type Stage = 'empty' | 'loading' | 'ready' | 'masking' | 'done'

type Phase = NonNullable<Progress['phase']>

/** What applying a template did, shown above the grid. */
interface TemplateNote extends TemplateResult {
  name: string
  total: number
  sheets?: string[]
}

/** A template name usable as a file name. */
function fileSafe(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'template'
}

function initialConfigs(info: WorkbookInfo): Record<string, ColumnConfig> {
  const configs: Record<string, ColumnConfig> = {}
  // Same header, same default prefix: if selected in several sheets, equal values get equal codes.
  const firstCol = new Map<string, number>()
  for (const col of info.columns) {
    if (!firstCol.has(col.headerKey)) firstCol.set(col.headerKey, col.colIndex)
    const type = col.suggestion?.type ?? 'custom'
    configs[col.key] = {
      key: col.key,
      sheet: col.sheet,
      col: col.colIndex,
      header: col.header,
      enabled: false,
      type,
      method: methodsFor(type)[0],
      prefix: suggestPrefix(type, col.header, firstCol.get(col.headerKey)!),
    }
  }
  return configs
}

/** Header row of every sheet, as shown in the app. */
function headerRowsOf(info: WorkbookInfo): Record<string, number> {
  return Object.fromEntries(info.sheets.map((s) => [s.name, s.headerRow]))
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

export function MaskPanel({
  onHasFileChange,
  onRestore,
}: {
  onHasFileChange?: (hasFile: boolean) => void
  onRestore?: (h: { json: string; fileName: string }) => void
}) {
  const { t } = useI18n()
  const [stage, setStage] = useState<Stage>('empty')
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const [info, setInfo] = useState<WorkbookInfo | null>(null)
  const hasFile = !!info && stage !== 'empty' && stage !== 'loading'
  useEffect(() => {
    onHasFileChange?.(hasFile)
  }, [hasFile, onHasFileChange])
  const [configs, setConfigs] = useState<Record<string, ColumnConfig>>({})
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [selectMenuOpen, setSelectMenuOpen] = useState(false)
  const [loadingRows, setLoadingRows] = useState(false)
  /** The worker is reading the file again with other header rows. */
  const [describing, setDescribing] = useState(false)
  /** Template to apply once the file has been read again with its header rows. */
  const afterDescribe = useRef<Template | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [touchedPrefix, setTouchedPrefix] = useState<Set<string>>(new Set())
  const [skipSheets, setSkipSheets] = useState<Set<string>>(new Set())
  const [templates, setTemplates] = useState<Template[]>(loadSavedTemplates)
  /** Template picked in step 1, applied to every file loaded while it stays picked. */
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null)
  const [templateNote, setTemplateNote] = useState<TemplateNote | null>(null)
  /** A saved template that fits the loaded file, offered with an "Apply" button. */
  const [suggestedTemplate, setSuggestedTemplate] = useState<Template | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [progress, setProgress] = useState<{ phase: Phase; pct: number }>({ phase: 'mask', pct: 0 })
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<MaskOutput | null>(null)
  const [downloaded, setDownloaded] = useState({ masked: false, mapping: false })
  const stageRef = useRef(stage)
  stageRef.current = stage
  /** Current job: bumped for each loaded file and on reset, so late answers about an old file are dropped. */
  const jobRef = useRef(0)
  const resultRef = useRef<HTMLDivElement>(null)

  const fail = (err: WorkerError, back: Stage) => {
    setError(errorText(t, err))
    setStage(back)
  }

  const post = useWorker<MaskRequest, MaskResponse>(
    () => new Worker(new URL('../workers/mask.worker.ts', import.meta.url), { type: 'module' }),
    (msg) => {
      if (msg.job !== jobRef.current) return
      switch (msg.type) {
        case 'loaded': {
          setInfo(msg.info)
          setActiveKey(null)
          setActiveSheet(0)
          setLoadingRows(false)
          setSavingTemplate(false)
          if (pendingTemplate) {
            applyTemplateTo(pendingTemplate, msg.info)
          } else {
            setConfigs(initialConfigs(msg.info))
            setTouchedPrefix(new Set())
            setSkipSheets(new Set())
            setTemplateNote(null)
            setSuggestedTemplate(bestTemplate(templates, new Set(msg.info.columns.map((c) => c.headerKey))))
          }
          setStage('ready')
          break
        }
        case 'described': {
          setDescribing(false)
          const template = afterDescribe.current
          afterDescribe.current = null
          if (template) {
            setInfo(msg.info)
            applyTemplateTo(template, msg.info)
            break
          }
          // Sheets whose header row changed start over; the others keep their settings and loaded rows.
          const old = new Map((info?.sheets ?? []).map((s) => [s.name, s]))
          const changed = new Set(msg.info.sheets.filter((s) => old.get(s.name)?.headerRow !== s.headerRow).map((s) => s.name))
          const fresh = initialConfigs(msg.info)
          setConfigs((prev) => Object.fromEntries(Object.entries(fresh).map(([k, c]) => [k, changed.has(c.sheet) || !prev[k] ? c : prev[k]])))
          setTouchedPrefix((s) => new Set([...s].filter((k) => fresh[k] && !changed.has(fresh[k].sheet))))
          setInfo({ ...msg.info, sheets: msg.info.sheets.map((s) => (changed.has(s.name) ? s : (old.get(s.name) ?? s))) })
          setActiveKey(null)
          break
        }
        case 'rows':
          setLoadingRows(false)
          // Ignore an answer that no longer fits, e.g. from a file that was replaced meanwhile.
          setInfo(
            (cur) =>
              cur && {
                ...cur,
                sheets: cur.sheets.map((s) =>
                  s.name === msg.sheet && s.preview.length - 1 === msg.start ? { ...s, preview: [...s.preview, ...msg.rows] } : s,
                ),
              },
          )
          break
        case 'progress':
          setProgress({ phase: msg.phase ?? 'mask', pct: (msg.done / Math.max(1, msg.total)) * 100 })
          break
        case 'masked':
          setOutput(msg)
          setDownloaded({ masked: false, mapping: false })
          setStage('done')
          setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
          break
        case 'error':
          setLoadingRows(false)
          setDescribing(false)
          afterDescribe.current = null
          fail(msg, stageRef.current === 'loading' ? 'empty' : stageRef.current === 'done' ? 'done' : 'ready')
          break
      }
    },
    () => {
      setError(t('err_worker_crashed'))
      setLoadingRows(false)
      setDescribing(false)
      afterDescribe.current = null
      setInfo(null)
      setStage('empty')
    },
  )

  const send = (cmd: MaskCommand, transfer?: Transferable[]) => post({ ...cmd, job: jobRef.current }, transfer)

  const load = async (name: string, size: number, getBuffer: () => Promise<ArrayBuffer>) => {
    const job = ++jobRef.current
    setError(null)
    setOutput(null)
    setFile({ name, size })
    setStage('loading')
    try {
      const buffer = await getBuffer()
      if (job !== jobRef.current) return
      setFile({ name, size: buffer.byteLength })
      send({ type: 'load', buffer, fileName: name, headerRows: pendingTemplate?.headerRows }, [buffer])
    } catch (err) {
      setError(errorText(t, { code: 'read-failed', details: [String(err)] }))
      setStage('empty')
    }
  }

  /** A .json file is taken as a template (see TemplatePicker). */
  const onTemplateFile = async (f: File) => {
    setError(null)
    try {
      setPendingTemplate(parseTemplate(await f.text()))
    } catch {
      setError(t('err_template'))
    }
  }

  const onFile = (f: File) => {
    if (/\.json$/i.test(f.name)) {
      void onTemplateFile(f)
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

  /** The mapping of the last run would be lost: it exists and was never downloaded. */
  const mappingAtRisk = !!output && !downloaded.mapping

  /**
   * Drop the last result before a change that makes it stale. Returns false, and changes
   * nothing, if the user prefers to keep a mapping they have not downloaded yet.
   */
  const invalidateOutput = (): boolean => {
    if (mappingAtRisk && !confirmDiscardMapping(t)) return false
    setOutput(null)
    if (stage === 'done') setStage('ready')
    return true
  }

  // Closing or reloading the tab would lose it too.
  useEffect(() => {
    if (!mappingAtRisk) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [mappingAtRisk])

  const update = (key: string, patch: Partial<ColumnConfig>): boolean => {
    if (!invalidateOutput()) return false
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
    return true
  }

  /** Read a sheet again with another header row. Its columns start over. */
  const changeHeaderRow = (sheet: string, row: number) => {
    if (!info || !invalidateOutput()) return
    setDescribing(true)
    setActiveKey(null)
    send({ type: 'describe', headerRows: { ...headerRowsOf(info), [sheet]: row } })
  }

  const loadMoreRows = (sheet: SheetInfo) => {
    setLoadingRows(true)
    send({ type: 'rows', sheet: sheet.name, headerRow: sheet.headerRow, start: sheet.preview.length - 1, count: PREVIEW_PAGE })
  }

  /** Click on a column: select it and open its settings popup (click again to close). */
  const open = (key: string) => {
    if (!configs[key].enabled && !update(key, { enabled: true })) return
    setActiveKey((cur) => (cur === key ? null : key))
  }

  /** Header checkbox: switch a column on/off without opening the popup. */
  const toggle = (key: string) => {
    if (!update(key, { enabled: !configs[key].enabled })) return
    if (activeKey === key) setActiveKey(null)
  }

  const setEnabled = (isOn: (key: string) => boolean) => {
    if (!invalidateOutput()) return
    setConfigs((prev) => Object.fromEntries(Object.entries(prev).map(([k, c]) => [k, { ...c, enabled: isOn(k) }])))
  }

  /** Columns with the same header in other sheets, whose settings differ from this column's. */
  const unsyncedTwins = (column: ColumnInfo): ColumnInfo[] => {
    const cur = configs[column.key]
    return (info?.columns ?? []).filter((c) => {
      if (!c.header || c.headerKey !== column.headerKey || c.sheet === column.sheet || skipSheets.has(c.sheet)) return false
      const other = configs[c.key]
      return other.enabled !== cur.enabled || other.type !== cur.type || other.method !== cur.method || other.prefix !== cur.prefix
    })
  }

  const applyToTwins = (column: ColumnInfo) => {
    if (!invalidateOutput()) return
    const twins = unsyncedTwins(column).map((c) => c.key)
    const { enabled, type, method, prefix } = configs[column.key]
    setTouchedPrefix((s) => new Set([...s, ...twins]))
    setConfigs((prev) => ({ ...prev, ...Object.fromEntries(twins.map((k) => [k, { ...prev[k], enabled, type, method, prefix }])) }))
  }

  const selectSuggested = () => {
    const suggested = info?.columns.filter((c) => c.suggestion).map((c) => c.key) ?? []
    setEnabled((k) => suggested.includes(k))
    setActiveKey(null)
  }

  /** Apply a template the app suggested for the loaded file, first switching to its header rows if needed. */
  const applySuggested = (template: Template) => {
    if (!info || !invalidateOutput()) return
    const wanted = template.headerRows ?? {}
    if (info.sheets.some((s) => wanted[s.name] !== undefined && wanted[s.name] !== s.headerRow)) {
      afterDescribe.current = template
      setDescribing(true)
      send({ type: 'describe', headerRows: { ...headerRowsOf(info), ...wanted } })
    } else {
      applyTemplateTo(template, info)
    }
  }

  /** Apply a template to the loaded file, replacing the current selection. */
  const applyTemplateTo = (template: Template, fileInfo: WorkbookInfo) => {
    const result = applyTemplate(template, initialConfigs(fileInfo), fileInfo.sheets.map((s) => s.name))
    setConfigs(result.configs)
    // Keep the template's prefixes even if the user changes a column's type later.
    setTouchedPrefix(new Set(result.matchedKeys))
    setSkipSheets(new Set(result.skipSheets))
    setTemplateNote({ ...result, name: template.name, total: template.columns.length, sheets: template.sheets })
    setSuggestedTemplate(null)
    setActiveKey(null)
  }

  const toggleSheet = (name: string) => {
    if (!invalidateOutput()) return
    setSkipSheets((prev) => {
      const next = new Set(prev)
      if (!next.delete(name)) next.add(name)
      return next
    })
  }

  /** Show the column a warning is about, switching it on when it was left unmasked. */
  const fixWarning = (w: MaskWarning) => {
    const key = `${w.column}@${w.sheet}`
    if (!info || !configs[key]) return
    if (!configs[key].enabled && !update(key, { enabled: true })) return
    setActiveSheet(info.sheets.findIndex((s) => s.name === w.sheet))
    setActiveKey(key)
  }

  const warningText = (w: MaskWarning): string => {
    const vars = { header: w.header, sheet: w.sheet, count: w.count }
    switch (w.kind) {
      case 'pii-unmasked':
        return t('warnPii', { ...vars, detail: t(`detail_${w.detail}` as TKey) })
      case 'same-header-unmasked':
        return t('warnSameHeader', vars)
      case 'pii-above-header':
        return t('warnPiiAbove', vars)
      case 'skipped':
        return t(`warnSkipped_${w.detail}` as TKey, vars)
    }
  }

  const currentTemplate = (name: string) =>
    makeTemplate(
      name,
      info!.fileName,
      Object.values(configs),
      skipSheets.size ? info!.sheets.filter((s) => !skipSheets.has(s.name)).map((s) => s.name) : undefined,
      new Date(),
      // Only header rows the user changed: detection keeps working for the others.
      Object.fromEntries(info!.sheets.filter((s) => !skipSheets.has(s.name) && s.headerRow !== s.autoHeaderRow).map((s) => [s.name, s.headerRow])),
    )

  const saveTemplate = (name: string) => {
    const next = withTemplate(templates, currentTemplate(name))
    setTemplates(next)
    return storeTemplates(next)
  }

  const deleteTemplate = (name: string) => {
    const next = templates.filter((tpl) => tpl.name !== name)
    setTemplates(next)
    storeTemplates(next)
    if (pendingTemplate?.name === name) setPendingTemplate(null)
  }

  const mask = () => {
    if (stageRef.current === 'masking' || badPrefix.length) return
    stageRef.current = 'masking'
    setActiveKey(null)
    setError(null)
    setProgress({ phase: 'mask', pct: 0 })
    setStage('masking')
    setSavingTemplate(false)
    // Columns of left-out sheets are not masked (and get no dictionary).
    send({
      type: 'mask',
      configs: Object.values(configs).map((c) => (liveKeys.has(c.key) ? c : { ...c, enabled: false })),
      skipSheets: [...skipSheets],
      headerRows: headerRowsOf(info!),
    })
  }

  const reset = () => {
    if (mappingAtRisk && !confirmDiscardMapping(t)) return
    jobRef.current++
    setStage('empty')
    setInfo(null)
    setFile(null)
    setOutput(null)
    setError(null)
    setActiveKey(null)
    setActiveSheet(0)
    setLoadingRows(false)
    setDescribing(false)
    afterDescribe.current = null
    setSkipSheets(new Set())
    setTemplateNote(null)
    setSuggestedTemplate(null)
    setSavingTemplate(false)
  }

  const liveKeys = new Set(info?.sheets.filter((s) => !skipSheets.has(s.name)).flatMap((s) => s.keys))
  const selected = info ? info.columns.filter((c) => configs[c.key]?.enabled && liveKeys.has(c.key)) : []
  /** Selected code columns whose prefix the masker would refuse; caught before masking. */
  const badPrefix = selected.filter((c) => configs[c.key].method === 'code' && !isUsablePrefix(configs[c.key].prefix))
  const masking = stage === 'masking'
  const totalRows = info?.sheets.filter((s) => !skipSheets.has(s.name)).reduce((n, s) => n + s.rowCount, 0) ?? 0
  const base = info ? baseName(info.fileName) : ''
  const activeColumn = info?.columns.find((c) => c.key === activeKey) ?? null
  const prefixUse = (prefix: string) =>
    Object.values(configs).filter((c) => c.enabled && c.method === 'code' && c.prefix === prefix).length
  const step = stage === 'done' ? 2 : info && stage !== 'empty' && stage !== 'loading' ? 1 : 0
  const progressPct = progress.phase === 'read' ? 3 : progress.phase === 'write' ? 95 : 5 + progress.pct * 0.88
  const progressLabel =
    progress.phase === 'read' ? t('phaseRead') : progress.phase === 'write' ? t('phaseWrite') : t('processing', { pct: Math.round(progress.pct) })

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/60">
        <Stepper current={step} />
      </div>

      {/* Step 1: choose a file */}
      {(stage === 'empty' || stage === 'loading' || !info) && (
        <Card>
          <div className="space-y-4">
            <FileDropzone accept={SHEET_ACCEPT} title={t('dropTitle')} hint={t('dropHint')} onFile={onFile} disabled={stage === 'loading'} />
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950"
                onClick={trySample}
                disabled={stage === 'loading'}
              >
                <SparkIcon /> {t('trySample')}
              </button>
              <TemplatePicker
                templates={templates}
                active={pendingTemplate}
                disabled={stage === 'loading'}
                onPick={setPendingTemplate}
                onFile={(f) => void onTemplateFile(f)}
                onDelete={deleteTemplate}
              />
            </div>
            {stage === 'loading' && (
              <ProgressBar
                pct={30}
                pulse
                label={file?.size ? t('loadingFile', { name: file.name, size: formatBytes(file.size) }) : (file?.name ?? '')}
              />
            )}
            {error && <Alert kind="error">{error}</Alert>}
          </div>
        </Card>
      )}

      {/* Step 2: pick columns on the spreadsheet */}
      {info && stage !== 'empty' && stage !== 'loading' && (
        <>
          {/* Nothing can change while a mask run is in progress, or its result would not match the settings. */}
          <div inert={masking} className={cx('transition-opacity', masking && 'opacity-60')}>
          <Card className="!p-0">
            {/* File bar */}
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <FileIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{info.fileName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('sheetsInfo', { sheets: info.sheets.length - skipSheets.size, rows: totalRows.toLocaleString() })}
                  {skipSheets.size > 0 && ` (${t('sheetsSkipped', { n: skipSheets.size })})`}
                  {file && file.size > 0 && ` · ${formatBytes(file.size)}`}
                </p>
              </div>
              <button type="button" className={btnSecondary} onClick={reset}>
                {t('changeFile')}
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              {templateNote && (
                <Alert kind={templateNote.matched === templateNote.total ? 'success' : 'warn'}>
                  <p>{t('templateApplied', { name: templateNote.name, matched: templateNote.matched, total: templateNote.total })}</p>
                  {templateNote.missing.length > 0 && <p>{t('templateMissing', { headers: templateNote.missing.join(', ') })}</p>}
                  {templateNote.skipSheets.length > 0 && (
                    <p>{t('templateSkipped', { n: templateNote.skipSheets.length, sheets: templateNote.skipSheets.join(', ') })}</p>
                  )}
                  {templateNote.sheetsNotFound && <p>{t('templateSheetsNotFound', { sheets: templateNote.sheets?.join(', ') ?? '' })}</p>}
                </Alert>
              )}
              {suggestedTemplate && (
                <Alert kind="info">
                  <span className="flex flex-wrap items-center gap-2">
                    {t('templateSuggest', { name: suggestedTemplate.name, n: suggestedTemplate.columns.length })}
                    <button
                      type="button"
                      className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-700"
                      disabled={describing}
                      onClick={() => applySuggested(suggestedTemplate)}
                    >
                      {t('templateApply')}
                    </button>
                  </span>
                </Alert>
              )}

              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    ☝
                  </span>
                  {t('gridHelpShort')}
                  <Hint text={t('gridHelp')} align="start" />
                </p>
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  {info.columns.some((c) => c.suggestion) && (
                    <Tooltip content={t('selectSuggestedHint')} align="end">
                      <button
                        type="button"
                        className={cx(btnGhost, 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950')}
                        onClick={selectSuggested}
                      >
                        <WandIcon /> {t('selectSuggested')}
                      </button>
                    </Tooltip>
                  )}
                  <button
                    type="button"
                    data-select-menu
                    aria-haspopup="menu"
                    aria-expanded={selectMenuOpen}
                    className={btnGhost}
                    onClick={() => setSelectMenuOpen((v) => !v)}
                  >
                    {t('selectMenu')} ▾
                  </button>
                  <Tooltip content={t('templateSaveHint')} align="end">
                    <button
                      type="button"
                      data-template-save
                      aria-expanded={savingTemplate}
                      className={cx(btnGhost, 'text-emerald-700 disabled:opacity-40 dark:text-emerald-400')}
                      disabled={selected.length === 0}
                      onClick={() => {
                        setActiveKey(null)
                        setSavingTemplate((v) => !v)
                      }}
                    >
                      <BookmarkIcon /> {t('templateSave')}
                    </button>
                  </Tooltip>
                  <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" />
                  <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
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
                activeSheet={activeSheet}
                onSelectSheet={setActiveSheet}
                onLoadMore={loadMoreRows}
                loadingMore={loadingRows}
                onHeaderRow={changeHeaderRow}
                describing={describing}
                busy={stage === 'masking'}
                onOpen={open}
                onToggle={toggle}
                showOriginal={showOriginal}
                skipSheets={skipSheets}
                onToggleSheet={toggleSheet}
              />
            </div>

          </Card>
          </div>

          {stage !== 'done' && (
            <SelectionBar
              selected={selected}
              configs={configs}
              multiSheet={info.sheets.length > 1}
              badPrefix={badPrefix}
              masking={masking}
              disabled={describing}
              progress={{ pct: progressPct, label: progressLabel, pulse: progress.phase !== 'mask' }}
              error={error}
              onMask={mask}
              onOpenColumn={(c) => {
                setActiveSheet(info.sheets.findIndex((s) => s.name === c.sheet))
                setActiveKey(c.key)
              }}
              onRemove={(c) => update(c.key, { enabled: false })}
            />
          )}
        </>
      )}

      {info && activeColumn && stage !== 'empty' && stage !== 'loading' && (
        <Popover
          anchorKey={activeColumn.key}
          anchor={() => document.querySelector<HTMLElement>(`[data-column-grid] th[data-key="${CSS.escape(activeColumn.key)}"]`)}
          ignoreOutside={(el) => !!el.closest('[data-column-grid] th, [data-column-grid] td, [data-column-chip]')}
          onClose={() => setActiveKey(null)}
          label={activeColumn.header}
        >
          <ColumnInspector
            column={activeColumn}
            config={configs[activeColumn.key]}
            sharedPrefix={prefixUse(configs[activeColumn.key].prefix) > 1}
            multiSheet={info.sheets.length > 1}
            twinSheets={[...new Set(unsyncedTwins(activeColumn).map((c) => c.sheet))]}
            onApplyToTwins={() => applyToTwins(activeColumn)}
            onChange={(patch) => update(activeColumn.key, patch)}
            onClose={() => setActiveKey(null)}
          />
        </Popover>
      )}

      {info && selectMenuOpen && stage !== 'empty' && stage !== 'loading' && (
        <Popover
          anchorKey="select-menu"
          anchor={() => document.querySelector<HTMLElement>('[data-select-menu]')}
          ignoreOutside={(el) => !!el.closest('[data-select-menu]')}
          onClose={() => setSelectMenuOpen(false)}
          label={t('selectMenu')}
          width={220}
        >
          <ul className="p-1 text-sm">
            {[
              { label: t('selectAll'), run: () => setEnabled(() => true) },
              { label: t('selectNone'), run: () => setEnabled(() => false) },
              {
                label: t('selectNoneSheet'),
                run: () => setEnabled((k) => configs[k].enabled && configs[k].sheet !== info.sheets[activeSheet].name),
              },
            ].map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    setSelectMenuOpen(false)
                    item.run()
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}

      {info && savingTemplate && stage !== 'empty' && stage !== 'loading' && (
        <Popover
          anchorKey="template-save"
          anchor={() => document.querySelector<HTMLElement>('[data-template-save]')}
          ignoreOutside={(el) => !!el.closest('[data-template-save]')}
          onClose={() => setSavingTemplate(false)}
          label={t('templateSave')}
        >
          <TemplateSaver
            defaultName={templateNote?.name ?? base}
            onSave={saveTemplate}
            onDownload={(name) => downloadBlob(JSON.stringify(currentTemplate(name), null, 2), `${fileSafe(name)}.template.json`, MIME.json)}
          />
        </Popover>
      )}

      {/* Step 3: download */}
      {stage === 'done' && output && (
        <div ref={resultRef} className="scroll-mt-24">
          <ResultCard
            output={output}
            base={base}
            originalSize={file?.size ?? 0}
            downloaded={downloaded}
            onDownloadMasked={() => {
              downloadBlob(output.masked, `${base}_masked.${output.format}`, MIME[output.format])
              setDownloaded((d) => ({ ...d, masked: true }))
            }}
            onDownloadMapping={() => {
              downloadBlob(output.mapping, `${base}_mapping_PRIVATE.json`, MIME.json)
              setDownloaded((d) => ({ ...d, mapping: true }))
            }}
            warningText={warningText}
            onFixWarning={fixWarning}
            onEdit={() => document.querySelector('[data-column-grid]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            onRestore={() => onRestore?.({ json: new TextDecoder().decode(output.mapping), fileName: `${base}_mapping_PRIVATE.json` })}
            onMaskAgain={reset}
          />
        </div>
      )}
    </div>
  )
}
