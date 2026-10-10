import { useRef, useState } from 'react'
import { selfCheckIsoWeek1 } from '../utils/isoWeek'
import type { AppUser, ImportReportRow, Lang } from '../types'
import { t, type I18nKey } from '../i18n'
import { useReferenceData } from '../context/ReferenceDataContext'
import { ApiError } from '../api/authApi'
import { importEmployees, importProjects, type DepartmentImportSummary, type ImportReport } from '../api/referenceApi'
import { getToken } from '../auth/session'

const MOTIF_KEYS: Record<string, I18nKey> = {
  'PERNR manquant': 'motif_pernr_manquant',
  'PERNR en doublon': 'motif_pernr_doublon',
  'PERNR manager introuvable (ligne orpheline)': 'motif_manager_introuvable',
  'Statut inconnu': 'motif_statut_inconnu',
  'Code projet manquant': 'motif_code_manquant',
  'Code projet en doublon': 'motif_code_doublon',
}

function translateMotif(lang: Lang, motif: string | undefined): string {
  if (!motif) return '—'
  const key = MOTIF_KEYS[motif]
  return key ? t(lang, key) : motif
}

export default function AdminImport({ user, lang }: { user: AppUser; lang: Lang }) {
  const { directions, departments, employees, projects, activityCodes, refetchEmployees, refetchProjects } = useReferenceData()
  const [report, setReport] = useState<ImportReportRow[] | null>(null)
  const [reportKind, setReportKind] = useState<'collaborateurs' | 'projets' | null>(null)
  const [deptSummary, setDeptSummary] = useState<DepartmentImportSummary[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFile(kind: 'collaborateurs' | 'projets', file: File) {
    const token = getToken()
    if (!token) return
    setImporting(true)
    setError(null)
    try {
      const result: ImportReport = kind === 'collaborateurs'
        ? await importEmployees(token, file)
        : await importProjects(token, file)
      setReportKind(kind)
      setReport(result.rapport)
      setDeptSummary(result.par_departement)
      if (kind === 'collaborateurs') await refetchEmployees()
      else await refetchProjects()
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Erreur lors de l'import.")
    } finally {
      setImporting(false)
    }
  }

  const isoChecks = selfCheckIsoWeek1()

  // Garde de rendu (cahier des charges §2.2/§4.1) — même principe que AccountsPage/LogsPage :
  // onglet réservé à l'ADMIN (Header.tsx) + ce garde-fou + endpoints backend déjà derrière
  // require_roles("ADMIN") (routers/reference_data.py). Après les hooks (règle des hooks).
  if (user.role !== 'ADMIN') return null

  return (
    <div>
      <div className="page-head">
        <p className="eyebrow">{t(lang, 'admin_eyebrow')}</p>
        <h1 className="page-title">{t(lang, 'admin_title')}</h1>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">{t(lang, 'import_employees_title')}</div>
          <div className="dropzone">
            {t(lang, 'import_employees_hint')}
            <div style={{ marginTop: 14 }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={importing}
                onClick={() => { fileInput.current?.setAttribute('data-kind', 'collaborateurs'); fileInput.current?.click() }}
              >
                {importing ? '…' : t(lang, 'choose_file')}
              </button>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t(lang, 'import_projects_title')}</div>
          <div className="dropzone">
            {t(lang, 'import_projects_hint')}
            <div style={{ marginTop: 14 }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={importing}
                onClick={() => { fileInput.current?.setAttribute('data-kind', 'projets'); fileInput.current?.click() }}
              >
                {importing ? '…' : t(lang, 'choose_file')}
              </button>
            </div>
          </div>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          const kind = fileInput.current?.getAttribute('data-kind') as 'collaborateurs' | 'projets' | null
          if (file && kind) handleFile(kind, file)
          e.target.value = ''
        }}
      />

      {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

      {report && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            {t(lang, 'import_report_title')} — {reportKind === 'collaborateurs' ? t(lang, 'report_kind_employees') : t(lang, 'report_kind_projects')} ·{' '}
            {report.filter((r) => r.statut === 'accepté').length} {t(lang, 'accepted_count')},{' '}
            {report.filter((r) => r.statut === 'rejeté').length} {t(lang, 'rejected_count')}
          </div>
          <table className="report-table">
            <thead><tr><th>{t(lang, 'col_line')}</th><th>{t(lang, 'col_status')}</th><th>{t(lang, 'col_reason')}</th><th>{t(lang, 'col_detail')}</th></tr></thead>
            <tbody>
              {report.map((r, i) => (
                <tr key={i}>
                  <td>{r.ligne}</td>
                  <td><span className={`badge ${r.statut === 'accepté' ? 'ok' : 'ko'}`}>{r.statut === 'accepté' ? t(lang, 'status_accepted') : t(lang, 'status_rejected')}</span></td>
                  <td>{translateMotif(lang, r.motif)}</td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deptSummary && deptSummary.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">{t(lang, 'import_by_department_title')}</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>{t(lang, 'col_department')}</th>
                <th>{t(lang, 'col_collaborateurs')}</th>
                <th>{t(lang, 'col_ready_status')}</th>
              </tr>
            </thead>
            <tbody>
              {deptSummary.map((d) => (
                <tr key={d.department_id}>
                  <td>{d.department_nom}</td>
                  <td>{d.collaborateurs}</td>
                  <td><span className={`badge ${d.pret ? 'ok' : 'ko'}`}>{d.pret ? t(lang, 'ready_yes') : t(lang, 'ready_no')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">{t(lang, 'activity_codes_title')}</div>
          <table className="report-table">
            <thead><tr><th>{t(lang, 'col_code')}</th><th>{t(lang, 'col_libelle')}</th><th>{t(lang, 'col_famille')}</th><th>{t(lang, 'col_projet')}</th></tr></thead>
            <tbody>
              {activityCodes.map((c) => (
                <tr key={c.code}>
                  <td><span className="legend-swatch" style={{ background: c.couleur }} />{c.code}</td>
                  <td>{c.libelle}</td>
                  <td>{c.famille}</td>
                  <td>{c.projetObligatoire ? t(lang, 'mandatory') : t(lang, 'forbidden')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-title">{t(lang, 'iso_check_title')}</div>
          <table className="report-table">
            <thead><tr><th>{t(lang, 'col_year')}</th><th>{t(lang, 'col_monday')}</th><th>{t(lang, 'col_status')}</th></tr></thead>
            <tbody>
              {isoChecks.map((c) => (
                <tr key={c.year}>
                  <td>{c.year}</td>
                  <td>{c.monday}</td>
                  <td><span className="badge ok">{t(lang, 'computed_not_hardcoded')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: 'var(--cap-grey)', marginTop: 10 }}>
            {directions.length} {t(lang, 'ref_summary_directions')} · {departments.length} {t(lang, 'ref_summary_departments')} ·{' '}
            {employees.length} {t(lang, 'ref_summary_employees')} · {projects.filter((p) => p.statut === 'actif').length} {t(lang, 'ref_summary_active_projects')}.
          </p>
        </div>
      </div>
    </div>
  )
}
