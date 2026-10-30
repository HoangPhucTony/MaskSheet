import { useState, type ReactNode } from 'react'
import {
  ArrowRightIcon,
  CloudOffIcon,
  CodeIcon,
  EyeOffIcon,
  GlobeIcon,
  LockIcon,
  MoonIcon,
  RestoreIcon,
  ShieldIcon,
  SparkIcon,
  SunIcon,
} from './components/icons'
import { MaskPanel } from './components/MaskPanel'
import { Tooltip } from './components/Tooltip'
import { btnGhost } from './components/ui'
import { UnmaskPanel } from './components/UnmaskPanel'
import { useI18n } from './i18n'
import { useTheme } from './theme'
import { cx } from './util'

type Tab = 'mask' | 'unmask'

function Badge({ icon, label, hint }: { icon: ReactNode; label: string; hint: string }) {
  return (
    <Tooltip content={hint}>
      <span
        tabIndex={0}
        className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs backdrop-blur transition hover:border-emerald-300 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:text-emerald-300"
      >
        <span className="text-emerald-600 dark:text-emerald-400">{icon}</span>
        {label}
      </span>
    </Tooltip>
  )
}

function HowStep({ n, icon, title, desc, hint }: { n: number; icon: ReactNode; title: string; desc: string; hint: string }) {
  return (
    <Tooltip content={hint} side="bottom" className="flex-1">
      <div
        tabIndex={0}
        className="group w-full cursor-help rounded-2xl border border-slate-200/80 bg-white/70 p-4 text-left shadow-xs backdrop-blur transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-emerald-800"
      >
        <div className="mb-2 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-lg text-emerald-700 transition group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-950 dark:text-emerald-300">
            {icon}
          </span>
          <span className="text-xs font-semibold text-slate-400">0{n}</span>
          <span className="font-semibold">{title}</span>
        </div>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{desc}</p>
      </div>
    </Tooltip>
  )
}

export function App() {
  const { t, lang, setLang } = useI18n()
  const [theme, toggleTheme] = useTheme()
  const [tab, setTab] = useState<Tab>('mask')

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip">
      {/* Soft background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(60rem_28rem_at_15%_-10%,rgba(16,185,129,0.16),transparent),radial-gradient(50rem_24rem_at_90%_0%,rgba(14,165,233,0.12),transparent)] dark:bg-[radial-gradient(60rem_28rem_at_15%_-10%,rgba(16,185,129,0.14),transparent),radial-gradient(50rem_24rem_at_90%_0%,rgba(14,165,233,0.10),transparent)]"
      />

      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/70 backdrop-blur-lg dark:border-slate-800/70 dark:bg-slate-950/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <a href="./" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg text-white shadow-md shadow-emerald-600/25">
              <LockIcon />
            </span>
            <span className="min-w-0">
              <span className="block text-lg leading-tight font-bold tracking-tight">MaskSheet</span>
              <span className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">{t('appTagline')}</span>
            </span>
          </a>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" className={btnGhost} onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}>
              <GlobeIcon /> {t('switchLang')}
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
              title={theme === 'dark' ? t('themeLight') : t('themeDark')}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
        <section className="pt-10 pb-8 text-center sm:pt-14">
          <h1 className="mx-auto max-w-3xl text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-5xl">
            <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 bg-clip-text text-transparent dark:from-emerald-400 dark:via-teal-300 dark:to-sky-400">
              {t('heroTitle')}
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-pretty text-slate-600 sm:text-lg dark:text-slate-400">
            {t('heroSubtitle')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Badge icon={<ShieldIcon />} label={t('badgeLocal')} hint={t('badgeLocalHint')} />
            <Badge icon={<CloudOffIcon />} label={t('badgeNoUpload')} hint={t('badgeNoUploadHint')} />
            <Badge icon={<CodeIcon />} label={t('badgeOpen')} hint={t('badgeOpenHint')} />
          </div>

          <div className="mt-8 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
            <HowStep n={1} icon={<EyeOffIcon />} title={t('how1Title')} desc={t('how1Desc')} hint={t('how1Hint')} />
            <ArrowRightIcon className="hidden shrink-0 text-xl text-slate-300 md:block dark:text-slate-600" />
            <HowStep n={2} icon={<SparkIcon />} title={t('how2Title')} desc={t('how2Desc')} hint={t('how2Hint')} />
            <ArrowRightIcon className="hidden shrink-0 text-xl text-slate-300 md:block dark:text-slate-600" />
            <HowStep n={3} icon={<RestoreIcon />} title={t('how3Title')} desc={t('how3Desc')} hint={t('how3Hint')} />
          </div>
        </section>

        <div className="mb-6 flex justify-center">
          <div
            role="tablist"
            className="grid w-full grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white/80 p-1.5 shadow-sm backdrop-blur sm:w-auto dark:border-slate-800 dark:bg-slate-900/80"
          >
            {(['mask', 'unmask'] as const).map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cx(
                  'inline-flex items-center justify-center gap-2 rounded-xl px-7 py-2.5 text-sm font-semibold transition',
                  tab === id
                    ? 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/25'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
                )}
              >
                {id === 'mask' ? <EyeOffIcon /> : <RestoreIcon />}
                {id === 'mask' ? t('tabMask') : t('tabUnmask')}
              </button>
            ))}
          </div>
        </div>

        {/* Both panels stay mounted so switching tabs keeps their state. */}
        <div hidden={tab !== 'mask'}>
          <MaskPanel />
        </div>
        <div hidden={tab !== 'unmask'}>
          <UnmaskPanel />
        </div>
      </main>

      <footer className="border-t border-slate-200/70 py-6 text-center text-xs text-slate-500 dark:border-slate-800/70 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <LockIcon /> MaskSheet · {t('footer')}
        </span>
      </footer>
    </div>
  )
}
