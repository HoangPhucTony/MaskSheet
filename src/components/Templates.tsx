import { useState } from 'react'
import { useI18n } from '../i18n'
import type { Template } from '../lib/template'
import { cx } from '../util'
import { BookmarkIcon, CheckIcon, DownloadIcon, UploadIcon, XIcon } from './icons'
import { Popover } from './Popover'
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
  const [open, setOpen] = useState(false)
  return (
    <>
      <span
        data-template-menu
        className={cx(
          'inline-flex items-center overflow-hidden rounded-full border text-sm font-medium transition',
          active
            ? 'border-emerald-500 bg-emerald-600 text-white'
            : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          className={cx('inline-flex max-w-[16rem] items-center gap-1.5 py-1.5 pl-4', active ? 'pr-2' : 'pr-4')}
          onClick={() => setOpen((v) => !v)}
        >
          {active ? (
            <>
              <CheckIcon /> <span className="truncate">{active.name}</span>
            </>
          ) : (
            <>
              <BookmarkIcon className="text-emerald-600 dark:text-emerald-400" /> {t('templateMenu')} <span aria-hidden="true">▾</span>
            </>
          )}
        </button>
        {active && (
          <button
            type="button"
            aria-label={t('templateClear')}
            title={t('templateClear')}
            disabled={disabled}
            className="flex items-center self-stretch px-2 opacity-70 transition hover:opacity-100"
            onClick={() => onPick(null)}
          >
            <XIcon />
          </button>
        )}
      </span>
      {open && !disabled && (
        <Popover
          anchorKey="template-menu"
          anchor={() => document.querySelector<HTMLElement>('[data-template-menu]')}
          ignoreOutside={(el) => !!el.closest('[data-template-menu]')}
          onClose={() => setOpen(false)}
          label={t('templateMenu')}
          width={300}
        >
          <div className="space-y-3 p-3 text-sm">
            {templates.length > 0 && (
              <ul className="space-y-1">
                {templates.map((tpl) => {
                  const on = active?.name === tpl.name
                  return (
                    <li
                      key={tpl.name}
                      className={cx(
                        'flex items-center rounded-lg border text-xs font-medium transition',
                        on
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'border-slate-200 text-slate-700 hover:border-emerald-400 dark:border-slate-700 dark:text-slate-300',
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={on}
                        title={`${tpl.columns.length} · ${tpl.sourceFile}`}
                        className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-left"
                        onClick={() => {
                          onPick(on ? null : tpl)
                          setOpen(false)
                        }}
                      >
                        {on && <CheckIcon className="shrink-0" />}
                        <span className="truncate">{tpl.name}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={t('templateDelete')}
                        title={t('templateDelete')}
                        className="flex items-center px-2.5 py-2 opacity-60 transition hover:opacity-100"
                        onClick={() => onDelete(tpl.name)}
                      >
                        <XIcon />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <label className={cx(btnSecondary, 'w-full cursor-pointer !px-3 !py-1.5 text-xs')}>
              <UploadIcon /> {t('templateUpload')}
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    onFile(file)
                    setOpen(false)
                  }
                  e.target.value = ''
                }}
              />
            </label>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('templateHint')}</p>
          </div>
        </Popover>
      )}
    </>
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
