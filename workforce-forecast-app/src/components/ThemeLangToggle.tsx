import type { Lang } from '../types'
import type { Theme } from '../theme'
import { SunIcon, MoonIcon } from './icons/ThemeIcons'

export default function ThemeLangToggle({
  theme,
  onChangeTheme,
  lang,
  onChangeLang,
}: {
  theme: Theme
  onChangeTheme: (t: Theme) => void
  lang: Lang
  onChangeLang: (l: Lang) => void
}) {
  return (
    <div className="preauth-toggles">
      <div className="theme-toggle" role="group" aria-label={lang === 'FR' ? 'Thème' : 'Theme'}>
        <button className={theme === 'light' ? 'active' : ''} onClick={() => onChangeTheme('light')} title="Light" aria-label="Light">
          <SunIcon />
        </button>
        <button className={theme === 'dark' ? 'active' : ''} onClick={() => onChangeTheme('dark')} title="Dark" aria-label="Dark">
          <MoonIcon />
        </button>
      </div>
      <div className="lang-toggle">
        <button className={lang === 'FR' ? 'active' : ''} onClick={() => onChangeLang('FR')}>FR</button>
        <button className={lang === 'EN' ? 'active' : ''} onClick={() => onChangeLang('EN')}>EN</button>
      </div>
    </div>
  )
}
