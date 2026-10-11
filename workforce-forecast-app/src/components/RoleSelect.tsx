import type { Lang, Role } from '../types'
import Logo from './Logo'
import { t } from '../i18n'

export default function RoleSelect({ lang, onSelect }: { lang: Lang; onSelect: (role: Role) => void }) {
  const OPTIONS: { role: Role; name: string; meta: string }[] = [
    { role: 'ADMIN', name: t(lang, 'role_admin'), meta: t(lang, 'role_admin_meta') },
    { role: 'EUM_EUD', name: t(lang, 'role_eum_eud_name'), meta: t(lang, 'role_eum_eud_meta') },
    { role: 'HEAD_OF_DIRECTION', name: t(lang, 'role_head'), meta: t(lang, 'role_head_meta') },
  ]
  return (
    <div className="login-wrap">
      <div className="login-visual">
        <div className="login-visual-text">
          <h2>{t(lang, 'login_hero_title')}</h2>
          <p>{t(lang, 'login_visual_quote')}</p>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-box">
          <Logo suffix="Workforce Forecast" />
          <h1>{t(lang, 'role_select_title')}</h1>
          <p className="sub">{t(lang, 'role_select_sub')}</p>

          <div className="role-list">
            {OPTIONS.map((opt) => (
              <button key={opt.role} type="button" className="role-option" onClick={() => onSelect(opt.role)}>
                <div className="r-name">{opt.name}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
