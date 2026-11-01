import { useState } from 'react'
import { useI18n } from '../i18n'
import type { Template } from '../lib/template'
import { cx } from '../util'
import { BookmarkIcon, CheckIcon, DownloadIcon, UploadIcon, XIcon } from './icons'
import { Hint } from './Tooltip'
import { btnPrimary, btnSecondary, inputBase } from './ui'

/** Step 1: pick a saved template, or load one from a .json file, before choosing the data file. */
export function TemplatePicker({
  templates,
  active,
  disabled,
  onPick,
  onFile,
  onDelete,
}: {
  templates: Template[]
  active: Template | null
  disabled?: boolean
  onPick: (template: Template | null) => void
  onFile: (file: File) => void
  onDelete: (name: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className={cx('rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800', disabled && 'pointer-events-none opacity-50')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <BookmarkIcon className="text-emerald-600 dark:text-emerald-400" /> {t('templateTitle')}
          <Hint text={t('templateHint')} align="start" />
        </span>
        <label className={cx(btnSecondary, 'cursor-pointer !px-3 !py-1.5 text-xs')}>
          <UploadIcon /> {t('templateUpload')}
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file)
              e.target.value = ''
            }}
          />
        </label>
        {templates.map((tpl) => {
          const on = active?.name === tpl.name
          return (
            <span
              key={tpl.name}
              className={cx(
                'inline-flex items-center overflow-hidden rounded-full border text-xs font-medium transition',
                on
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                title={`${tpl.columns.length} · ${tpl.sourceFile}`}
                className="inline-flex max-w-[14rem] items-center gap-1 py-1 pr-1 pl-2.5"
                onClick={() => onPick(on ? null : tpl)}
              >
                {on && <CheckIcon />}
                <span className="truncate">{tpl.name}</span>
              </button>
              <button
                type="button"
                aria-label={t('templateDelete')}
                title={t('templateDelete')}
                className="flex h-full items-center px-1.5 py-1 opacity-60 transition hover:opacity-100"
                onClick={() => onDelete(tpl.name)}
              >
                <XIcon />
              </button>
            </span>
          )
        })}
      </div>
      {active && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-emerald-700 dark:text-emerald-300">
          <span className="inline-flex items-start gap-1.5">
            <CheckIcon className="mt-1 shrink-0" /> {t('templateActive', { name: active.name })}
          </span>
          <button type="button" className="text-xs font-medium text-slate-500 underline hover:text-slate-800 dark:hover:text-white" onClick={() => onPick(null)}>
            {t('templateClear')}
          </button>
        </p>
      )}
    </div>
  )
}

/** Content of the "Save template" popup. */
export function TemplateSaver({
  defaultName,
  onSave,
  onDownload,
}: {
  defaultName: string
  /** Returns false when the browser refused to store it. */
  onSave: (name: string) => boolean
  onDownload: (name: string) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(defaultName)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const clean = name.trim()

  return (
    <div className="space-y-3 p-4 text-sm">
      <p className="font-semibold">{t('templateSave')}</p>
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('templateSaveHint')}</p>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{t('templateName')}</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setStatus(null)
          }}
          maxLength={60}
          className={cx(inputBase, 'w-full')}
          autoFocus
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={!clean}
          onClick={() =>
            setStatus(onSave(clean) ? { ok: true, text: t('templateSavedOk', { name: clean }) } : { ok: false, text: t('templateStorageFailed') })
          }
        >
          <BookmarkIcon /> {t('templateSaveBrowser')}
        </button>
        <button type="button" className={btnSecondary} disabled={!clean} onClick={() => onDownload(clean)}>
          <DownloadIcon /> {t('templateDownload')}
        </button>
      </div>
      {status && (
        <p className={cx('text-xs font-medium', status.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400')}>
          {status.text}
        </p>
      )}
    </div>
  )
}
