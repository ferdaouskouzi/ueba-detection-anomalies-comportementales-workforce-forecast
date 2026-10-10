import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { AppUser, ForecastEntry, Lang } from '../types'
import { useReferenceData } from '../context/ReferenceDataContext'
import { DEFAULT_PERIOD, periodDateRange, periodLabel, resolvePeriodDays, type PeriodFilter } from '../data/dashboardPeriod'
import { computeDashboardKpis, computeEmployeeBreakdown, matchesClientProject } from '../data/dashboardKpis'
import { familyOverTimeSeries, monthlyProductionSeries } from '../data/dashboardAggregates'
import { entryKey } from '../data/seedForecast'
import { toISODate } from '../utils/isoWeek'
import { exportDashboardXlsx } from '../utils/exportXlsx'
import { exportDashboardPptx } from '../utils/exportPptx'
import { FAMILY_COLOR } from '../constants/families'
import { listForecastEntries } from '../api/forecastApi'
import { getToken } from '../auth/session'
import { t } from '../i18n'

export default function DashboardDirection({ user, lang }: { user: AppUser; lang: Lang }) {
  const { directions, departments, employees, projects, activityCodes } = useReferenceData()
  // Tableau de bord de pilotage = Head of Direction uniquement (CDC §2.6). Double garde,
  // même principe que LogsPage : ce composant ne rend rien et ne déclenche aucun chargement
  // pour un autre rôle, même si on l'atteignait autrement que par l'onglet (state forcé…).
  const isHeadOfDirection = user.role === 'HEAD_OF_DIRECTION'
  const directionId = user.directionId ?? directions[0]?.id
  const [deptFilter, setDeptFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [period, setPeriod] = useState<PeriodFilter>(DEFAULT_PERIOD)
  const [exporting, setExporting] = useState<'xlsx' | 'pptx' | null>(null)
  const [entries, setEntries] = useState<Record<string, ForecastEntry>>({})

  // Le filtre "Période" borne directement la requête serveur (?start=&end=) au lieu de
  // charger tout l'historique pour le filtrer ensuite en JS — le serveur ne renvoie que les
  // saisies de la fenêtre demandée (cahier des charges §2.6 : filtrage jamais côté client
  // seul). Rechargé au focus et périodiquement, comme le fait ForecastGrid pour ses saisies,
  // pour qu'un HOD voie sans recharger la page les nouvelles saisies d'un lead.
  const range = useMemo(() => periodDateRange(period), [period])
  useEffect(() => {
    const token = getToken()
    if (!token || !range || !isHeadOfDirection) { setEntries({}); return }
    let cancelled = false
    function load() {
      listForecastEntries(token!, range!.start, range!.end)
        .then((backendEntries) => {
          if (cancelled) return
          const next: Record<string, ForecastEntry> = {}
          backendEntries.forEach((e) => { next[entryKey(e.pernr, e.date, e.demiJournee)] = e })
          setEntries(next)
        })
        .catch(() => void 0)
    }
    load()
    const interval = setInterval(load, 10000)
    window.addEventListener('focus', load)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', load)
    }
  }, [range?.start, range?.end, isHeadOfDirection])

  const direction = directions.find((d) => d.id === directionId)!
  const deptsInDirection = departments.filter((d) => d.directionId === directionId)
  const scopedDepts = deptFilter ? deptsInDirection.filter((d) => d.id === deptFilter) : deptsInDirection
  const scopedEmployees = employees.filter(
    (e) => scopedDepts.some((d) => d.id === e.departmentId) && (e.statut === 'Active' || e.statut === 'Unpaid Leave'),
  )
  const scopedPernrs = new Set(scopedEmployees.map((e) => e.pernr))
  const clients = Array.from(new Set(projects.map((p) => p.client)))
  const hasClientOrProject = Boolean(clientFilter || projectFilter)

  // Les 4 filtres du CDC (§2.6) sont cumulables et s'appliquent à l'ENSEMBLE du dashboard —
  // aucun graphique ne garde son propre périmètre indépendant. Point de vérité unique :
  // periodDays/periodDates pour la fenêtre temporelle, filteredEntries pour client/projet.
  const periodDays = useMemo(() => resolvePeriodDays(period), [period])
  const periodDates = useMemo(() => new Set(periodDays.map(toISODate)), [periodDays])

  // Filtre client/projet appliqué une fois pour les deux courbes mensuelles (KPI/ETP/
  // comparatif utilisent directement computeDashboardKpis, qui applique le même filtre).
  const filteredEntries = useMemo(() => {
    if (!hasClientOrProject) return entries
    const out: Record<string, ForecastEntry> = {}
    Object.entries(entries).forEach(([key, e]) => {
      if (matchesClientProject(e, projects, activityCodes, clientFilter, projectFilter)) out[key] = e
    })
    return out
  }, [entries, clientFilter, projectFilter, projects, activityCodes, hasClientOrProject])

  const kpis = useMemo(
    () => computeDashboardKpis(entries, employees, projects, activityCodes, {
      departmentIds: scopedDepts.map((d) => d.id), clientFilter, projectFilter, periodDates,
    }),
    [entries, employees, projects, activityCodes, scopedDepts, clientFilter, projectFilter, periodDates],
  )

  const deptComparison = scopedDepts.map((d) => ({
    departement: d.nom,
    tauxProduction: computeDashboardKpis(entries, employees, projects, activityCodes, {
      departmentIds: [d.id], clientFilter, projectFilter, periodDates,
    }).tauxProd,
  }))

  const monthly = monthlyProductionSeries(filteredEntries, scopedPernrs, activityCodes, periodDates)
  const familySeries = familyOverTimeSeries(filteredEntries, scopedPernrs, activityCodes, periodDates)

  const employeeBreakdown = useMemo(
    () => computeEmployeeBreakdown(entries, employees, departments, projects, activityCodes, {
      departmentIds: scopedDepts.map((d) => d.id), clientFilter, projectFilter, periodDates,
    }),
    [entries, employees, departments, projects, activityCodes, scopedDepts, clientFilter, projectFilter, periodDates],
  )

  async function doExportXlsx() {
    setExporting('xlsx')
    try { await exportDashboardXlsx({ direction, kpis, deptComparison, monthly, employeeBreakdown }) } finally { setExporting(null) }
  }
  async function doExportPptx() {
    setExporting('pptx')
    try {
      await exportDashboardPptx({
        direction, kpis, deptComparison, monthly, familySeries,
        periodLabel: periodLabel(period),
      })
    } finally { setExporting(null) }
  }

  if (!isHeadOfDirection) return null

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{direction.nom}</h1>
        <p className="eyebrow">{t(lang, 'dashboard_eyebrow')}</p>
      </div>

      <div className="filters-bar">
        <select className="select-pill" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">{t(lang, 'all_departments')}</option>
          {deptsInDirection.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
        </select>
        <select className="select-pill" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">{t(lang, 'all_projects')}</option>
          {projects.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.nom}</option>)}
        </select>
        <select className="select-pill" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">{t(lang, 'all_clients')}</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="select-pill"
          value={period.preset}
          onChange={(e) => setPeriod({ ...period, preset: e.target.value as PeriodFilter['preset'] })}
        >
          <option value="4w">{t(lang, 'period_4w')}</option>
          <option value="12m">{t(lang, 'period_12m')}</option>
          <option value="custom">{t(lang, 'period_custom')}</option>
        </select>
        {period.preset === 'custom' ? (
          <>
            <input
              type="date" className="select-pill" value={period.customStart}
              onChange={(e) => setPeriod({ ...period, customStart: e.target.value })}
            />
            <input
              type="date" className="select-pill" value={period.customEnd}
              onChange={(e) => setPeriod({ ...period, customEnd: e.target.value })}
            />
          </>
        ) : (
          periodDays.length > 0 && (
            <span className="select-pill" style={{ background: '#f4f6f9' }}>
              {toISODate(periodDays[0])} → {toISODate(periodDays[periodDays.length - 1])}
            </span>
          )
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={doExportXlsx} disabled={exporting !== null}>
            {exporting === 'xlsx' ? t(lang, 'exporting') : t(lang, 'export_xlsx')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={doExportPptx} disabled={exporting !== null}>
            {exporting === 'pptx' ? t(lang, 'exporting') : t(lang, 'export_pptx')}
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card"><div className="kpi-label">{t(lang, 'kpi_effectif')}</div><div className="kpi-value">{kpis.effectif}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t(lang, 'kpi_taux_prod')}</div><div className="kpi-value">{kpis.tauxProd}%</div></div>
        <div className="kpi-card"><div className="kpi-label">{t(lang, 'kpi_taux_bench')}</div><div className="kpi-value">{kpis.tauxBench}%</div></div>
        <div className="kpi-card"><div className="kpi-label">{t(lang, 'kpi_taux_absence')}</div><div className="kpi-value">{kpis.tauxAbsence}%</div></div>
        <div className="kpi-card"><div className="kpi-label">{t(lang, 'kpi_etp_total')}</div><div className="kpi-value">{kpis.etpTotal}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">{t(lang, 'chart_monthly')}</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} allowDataOverflow />
              <Tooltip />
              <Line type="monotone" dataKey="tauxProduction" name="Taux de production" stroke="#0070AD" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title">{t(lang, 'chart_etp_project')} {clientFilter && `— ${t(lang, 'chart_client_suffix')} ${clientFilter}`}</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={kpis.etpData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="code" width={95} tick={{ fontSize: 10.5 }} />
              <Tooltip formatter={(v: number, _n, p) => [`${v} ETP`, p.payload.nom]} />
              <Bar dataKey="etp" name="ETP" fill="#0070AD" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">{t(lang, 'chart_family')}</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={familySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              {/* allowDataOverflow : sans lui, Recharts élargit domain[1] au-delà de 100 dès que
                  la somme des 6 familles arrondies indépendamment dépasse 100 (ex. 101) — cf.
                  parseSpecifiedDomain dans recharts/lib/util/ChartUtils.js. */}
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} allowDataOverflow />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Production" stackId="1" stroke={FAMILY_COLOR.Production} fill={FAMILY_COLOR.Production} />
              <Area type="monotone" dataKey="Bench" stackId="1" stroke={FAMILY_COLOR.Bench} fill={FAMILY_COLOR.Bench} />
              <Area type="monotone" dataKey="Management" stackId="1" stroke={FAMILY_COLOR.Management} fill={FAMILY_COLOR.Management} />
              <Area type="monotone" dataKey="Formation" stackId="1" stroke={FAMILY_COLOR.Formation} fill={FAMILY_COLOR.Formation} />
              <Area type="monotone" dataKey="Alternance" stackId="1" stroke={FAMILY_COLOR.Alternance} fill={FAMILY_COLOR.Alternance} />
              <Area type="monotone" dataKey="Absence" stackId="1" stroke={FAMILY_COLOR.Absence} fill={FAMILY_COLOR.Absence} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title">{t(lang, 'chart_dept_compare')}</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="departement" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={55} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} allowDataOverflow />
              <Tooltip />
              <Bar dataKey="tauxProduction" name="Taux de production" fill="#001E64" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
