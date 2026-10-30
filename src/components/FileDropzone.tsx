import { useId, useRef, useState, type ReactNode } from 'react'
import { cx } from '../util'
import { UploadIcon } from './icons'

interface Props {
  accept: string
  title: string
  hint?: string
  onFile: (file: File) => void
  icon?: ReactNode
  compact?: boolean
  disabled?: boolean
}

export function FileDropzone({ accept, title, hint, onFile, icon, compact, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const id = useId()

  const pick = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) pick(e.dataTransfer.files)
      }}
      className={cx(
        'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-center transition',
        compact ? 'px-4 py-5' : 'px-6 py-12',
        over
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
          : 'border-slate-300 bg-slate-50/50 hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/20',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <span
        className={cx(
          'flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition group-hover:scale-105 dark:bg-emerald-950 dark:text-emerald-300',
          compact ? 'size-10 text-lg' : 'size-14 text-2xl',
        )}
      >
        {icon ?? <UploadIcon />}
      </span>
      <span className={cx('font-semibold text-slate-800 dark:text-slate-100', compact ? 'text-sm' : 'text-base')}>{title}</span>
      {hint && <span className="text-sm text-slate-500 dark:text-slate-400">{hint}</span>}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}
