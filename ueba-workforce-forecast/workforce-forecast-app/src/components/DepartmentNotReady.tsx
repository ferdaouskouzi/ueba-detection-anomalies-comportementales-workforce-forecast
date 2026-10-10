import type { Lang } from '../types'
import { t } from '../i18n'

export default function DepartmentNotReady({ lang }: { lang: Lang }) {
  return (
    <div className="page-head">
      <p className="eyebrow">{t(lang, 'forecast_eyebrow')}</p>
      <h1 className="page-title">{t(lang, 'dept_not_ready_title')}</h1>
      <div className="dropzone" style={{ marginTop: 18, maxWidth: 620 }}>
        {t(lang, 'dept_not_ready_body')}
      </div>
    </div>
  )
}
