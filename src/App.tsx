import { useState } from 'react'
import { GlobeIcon, LockIcon, MoonIcon, SunIcon } from './components/icons'
import { MaskPanel } from './components/MaskPanel'
import { btnGhost } from './components/ui'
import { UnmaskPanel } from './components/UnmaskPanel'
import { useI18n } from './i18n'
import { useTheme } from './theme'
import { cx } from './util'

type Tab = 'mask' | 'unmask'

export function App() {
  const { t, lang, setLang } = useI18n()
  const [theme, toggleTheme] = useTheme()
  const [tab, setTab] = useState<Tab>('mask')

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-lg text-white">
              <LockIcon />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg leading-tight font-bold tracking-tight">MaskSheet</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">{t('appTagline')}</p>
            </div>
          </div>
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

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 py-6">
        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <span className="text-xl" aria-hidden="true">
            🔒
          </span>
          <div className="space-y-0.5">
            <p className="font-semibold">{t('privacyBanner')}</p>
            <p className="text-sm text-emerald-800/80 dark:text-emerald-200/70">{t('privacyMore')}</p>
          </div>
        </div>

        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1 sm:inline-grid sm:w-auto dark:bg-slate-800">
          {(['mask', 'unmask'] as const).map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cx(
                'rounded-xl px-6 py-2 text-sm font-semibold transition',
                tab === id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
              )}
            >
              {id === 'mask' ? t('tabMask') : t('tabUnmask')}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted so switching tabs keeps their state. */}
        <div hidden={tab !== 'mask'}>
          <MaskPanel />
        </div>
        <div hidden={tab !== 'unmask'}>
          <UnmaskPanel />
        </div>
      </main>

      <footer className="border-t border-slate-200 py-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        MaskSheet · {t('footer')}
      </footer>
    </div>
  )
}
