import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { AppUser, DemiJournee, Famille, ForecastEntry, Lang } from '../types'
import { useReferenceData } from '../context/ReferenceDataContext'
import { directDirectReports, findEmployee } from '../data/employeeHelpers'
import { resolveActivityCode, resolveFamille } from '../data/dashboardKpis'
import { entryKey, currentMonday } from '../data/seedForecast'
import { addDays, formatFrDate, toISODate } from '../utils/isoWeek'
import { hexToRgba } from '../utils/color'
import { FAMILY_COLOR, FAMILY_LABEL, FAMILY_ORDER } from '../constants/families'
import { t } from '../i18n'
import DepartmentNotReady from './DepartmentNotReady'

type CellUpdate = { pernr: string; date: string; demi: DemiJournee }
type CopiedCell = { date: string; demi: DemiJournee; code: string; projectCode: string | null }
type CopiedWeekCell = { pernr: string; dayIndex: number; demi: DemiJournee; code: string; projectCode: string | null }

// Regroupe des cellules copiées par (code, projet) pour ne déclencher qu'un seul appel
// onPaint par groupe homogène — même mécanisme que fillRow/fillColumn, appliqué à des
// cellules hétérogènes issues d'un copier-coller.
function groupByCodeProject<T extends { code: string; projectCode: string | null }>(cells: T[]) {
  const groups = new Map<string, { code: string; projectCode: string | null; cells: T[] }>()
  cells.forEach((c) => {
    const key = `${c.code}|${c.projectCode ?? ''}`
    if (!groups.has(key)) groups.set(key, { code: c.code, projectCode: c.projectCode, cells: [] })
    groups.get(key)!.cells.push(c)
  })
  return Array.from(groups.values())
}

export default function ForecastGrid({
  user,
  entries,
  onPaint,
  lang,
}: {
  user: AppUser
  entries: Record<string, ForecastEntry>
  onPaint: (updates: CellUpdate[], code: string, projectCode: string | null) => void
  lang: Lang
}) {
  const { employees, departments, projects, activityCodes } = useReferenceData()

  const [horizon, setHorizon] = useState<1 | 2 | 4>(2)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedCode, setSelectedCode] = useState('P')
  const [selectedProject, setSelectedProject] = useState(projects.find((p) => p.statut === 'actif')?.code ?? '')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [painting, setPainting] = useState(false)

  const [focusedCell, setFocusedCell] = useState<{ pernr: string; dateISO: string; demi: DemiJournee } | null>(null)
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null)
  const [ribbonDetailOpen, setRibbonDetailOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [copiedRow, setCopiedRow] = useState<{ sourcePernr: string; cells: CopiedCell[] } | null>(null)
  const [copiedWeek, setCopiedWeek] = useState<{ cells: CopiedWeekCell[] } | null>(null)

  const dept = departments.find((d) => d.id === user.departmentId)
  const activeCode = selectedCode === '__erase' ? null : activityCodes.find((c) => c.code === selectedCode)

  const startMonday = useMemo(() => addDays(currentMonday(), weekOffset * 7), [weekOffset])
  const weeks = useMemo(() => {
    const list: { label: string; days: Date[] }[] = []
    for (let w = 0; w < horizon; w++) {
      const weekStart = addDays(startMonday, w * 7)
      const days = [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i))
      list.push({ label: `${t(lang, 'week_of')} ${formatFrDate(toISODate(weekStart))}`, days })
    }
    return list
  }, [startMonday, horizon, lang])

  const allDays = weeks.flatMap((w) => w.days)
  const cellCols = useMemo(
    () => allDays.flatMap((d) => ([{ dateISO: toISODate(d), demi: 'AM' as DemiJournee }, { dateISO: toISODate(d), demi: 'PM' as DemiJournee }])),
    [allDays.map(toISODate).join(',')],
  )

  // Construction de l'arbre récursif à partir du lead — la hiérarchie n'est jamais stockée,
  // elle est déduite du PERNR du manager (référentiel plat).
  type Node = { pernr: string; depth: number; children: Node[] }
  function buildTree(pernr: string, depth: number): Node {
    const reports = directDirectReports(employees, pernr).filter((e) => e.statut === 'Active' || e.statut === 'Unpaid Leave')
    return { pernr, depth, children: reports.map((r) => buildTree(r.pernr, depth + 1)) }
  }
  const tree = useMemo(() => buildTree(dept?.leadPernr ?? '', 0), [dept?.leadPernr])

  const visibleRows: Node[] = []
  function flatten(node: Node) {
    visibleRows.push(node)
    if (!collapsed[node.pernr]) node.children.forEach(flatten)
  }
  flatten(tree)

  const leafPernrs = visibleRows.filter((n) => n.children.length === 0).map((n) => n.pernr)

  function cellValue(pernr: string, dateISO: string, demi: DemiJournee) {
    return entries[entryKey(pernr, dateISO, demi)]
  }

  function applyPaint(pernr: string, dateISO: string, demi: DemiJournee) {
    if (activeCode?.projetObligatoire && !selectedProject) {
      alert(t(lang, 'alert_select_project'))
      return
    }
    onPaint([{ pernr, date: dateISO, demi }], selectedCode, activeCode?.projetObligatoire ? selectedProject : null)
  }

  function eraseCell(pernr: string, dateISO: string, demi: DemiJournee) {
    onPaint([{ pernr, date: dateISO, demi }], '__erase', null)
  }

  function fillRow(pernr: string) {
    if (activeCode?.projetObligatoire && !selectedProject) {
      alert(t(lang, 'alert_select_project'))
      return
    }
    const updates = allDays.map((d) => ({ pernr, date: toISODate(d), demi: 'AM' as DemiJournee }))
      .concat(allDays.map((d) => ({ pernr, date: toISODate(d), demi: 'PM' as DemiJournee })))
    onPaint(updates, selectedCode, activeCode?.projetObligatoire ? selectedProject : null)
  }

  function eraseRow(pernr: string) {
    const updates = allDays.map((d) => ({ pernr, date: toISODate(d), demi: 'AM' as DemiJournee }))
      .concat(allDays.map((d) => ({ pernr, date: toISODate(d), demi: 'PM' as DemiJournee })))
    onPaint(updates, '__erase', null)
  }

  function fillColumn(dateISO: string, demi: DemiJournee) {
    if (activeCode?.projetObligatoire && !selectedProject) {
      alert(t(lang, 'alert_select_project'))
      return
    }
    const updates = leafPernrs.map((pernr) => ({ pernr, date: dateISO, demi }))
    onPaint(updates, selectedCode, activeCode?.projetObligatoire ? selectedProject : null)
  }

  // Copier/coller une ligne — rejoue les entrées existantes de la ligne source sur une ligne
  // cible, groupées par (code, projet) puisqu'un appel onPaint ne porte qu'un seul couple à
  // la fois. Les entrées copiées ont déjà satisfait la règle R1 au moment de leur saisie
  // initiale ; aucune revalidation n'est nécessaire ici.
  function copyRow(pernr: string) {
    const cells: CopiedCell[] = []
    allDays.forEach((d) => {
      ;(['AM', 'PM'] as const).forEach((demi) => {
        const e = cellValue(pernr, toISODate(d), demi)
        if (e) cells.push({ date: toISODate(d), demi, code: e.code, projectCode: e.projectCode })
      })
    })
    setCopiedRow({ sourcePernr: pernr, cells })
  }

  async function pasteRow(targetPernr: string) {
    if (!copiedRow) return
    for (const group of groupByCodeProject(copiedRow.cells)) {
      const updates: CellUpdate[] = group.cells.map((c) => ({ pernr: targetPernr, date: c.date, demi: c.demi }))
      await onPaint(updates, group.code, group.projectCode)
    }
  }

  // Copier/coller une semaine — même principe que copier une ligne, mais la position du jour
  // dans la semaine (dayIndex) est conservée pour être réappliquée à la semaine cible.
  function copyWeek(weekIndex: number) {
    const days = weeks[weekIndex]?.days ?? []
    const cells: CopiedWeekCell[] = []
    leafPernrs.forEach((pernr) => {
      days.forEach((d, dayIndex) => {
        ;(['AM', 'PM'] as const).forEach((demi) => {
          const e = cellValue(pernr, toISODate(d), demi)
          if (e) cells.push({ pernr, dayIndex, demi, code: e.code, projectCode: e.projectCode })
        })
      })
    })
    setCopiedWeek({ cells })
  }

  async function pasteWeek(weekIndex: number) {
    if (!copiedWeek) return
    const days = weeks[weekIndex]?.days ?? []
    for (const group of groupByCodeProject(copiedWeek.cells)) {
      const updates: CellUpdate[] = group.cells
        .map((c) => {
          const targetDay = days[c.dayIndex]
          return targetDay ? { pernr: c.pernr, date: toISODate(targetDay), demi: c.demi } : null
        })
        .filter((u): u is CellUpdate => u !== null)
      if (updates.length) await onPaint(updates, group.code, group.projectCode)
    }
  }

  function focusCellAt(rowIdx: number, colIdx: number) {
    if (!leafPernrs.length || !cellCols.length) return
    const r = Math.max(0, Math.min(leafPernrs.length - 1, rowIdx))
    const c = Math.max(0, Math.min(cellCols.length - 1, colIdx))
    const pernr = leafPernrs[r]
    const col = cellCols[c]
    setFocusedCell({ pernr, dateISO: col.dateISO, demi: col.demi })
    document.getElementById(`fg-cell-${pernr}-${col.dateISO}-${col.demi}`)?.focus()
  }

  // Ferme le menu d'actions de ligne au premier clic en dehors, sans dépendance externe.
  useEffect(() => {
    if (!openRowMenu) return
    const close = () => setOpenRowMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [openRowMenu])

  // KPI d'en-tête
  const kpis = useMemo(() => {
    let prod = 0, bench = 0, absence = 0
    const total = leafPernrs.length * allDays.length * 2
    leafPernrs.forEach((pernr) => {
      allDays.forEach((d) => {
        ;(['AM', 'PM'] as const).forEach((demi) => {
          const e = cellValue(pernr, toISODate(d), demi)
          if (e) {
            const fam = resolveFamille(e, activityCodes)
            if (fam === 'Production') prod++
            if (fam === 'Bench') bench++
            if (fam === 'Absence') absence++
          }
        })
      })
    })
    return {
      effectif: leafPernrs.length,
      prodPct: total ? Math.round((prod / total) * 100) : 0,
      benchPct: total ? Math.round((bench / total) * 100) : 0,
      absPct: total ? Math.round((absence / total) * 100) : 0,
    }
  }, [entries, leafPernrs.join(','), allDays.map(toISODate).join(',')])

  // Ruban de capacité par demi-journée
  const ribbon = allDays.flatMap((d) => (['AM', 'PM'] as const).map((demi) => {
    const dateISO = toISODate(d)
    const counts: Record<string, number> = { Production: 0, Bench: 0, Management: 0, Formation: 0, Alternance: 0, Absence: 0, none: 0 }
    leafPernrs.forEach((pernr) => {
      const e = cellValue(pernr, dateISO, demi)
      const fam = e ? resolveFamille(e, activityCodes) : undefined
      if (fam) counts[fam]++
      else counts.none++
    })
    return { dateISO, demi, counts, total: leafPernrs.length || 1 }
  }))

  // Vue synthétique du ruban : un total par famille sur toute la période visible, pour un
  // rendu en barres labellisées plutôt qu'un empilement abstrait par demi-journée.
  const familyTotals = useMemo(() => {
    let totalSlots = 0
    const sums: Record<Famille, number> = { Production: 0, Bench: 0, Management: 0, Formation: 0, Alternance: 0, Absence: 0 }
    ribbon.forEach((col) => {
      FAMILY_ORDER.forEach((fam) => { sums[fam] += col.counts[fam] })
      totalSlots += col.total
    })
    return FAMILY_ORDER.map((fam) => ({ fam, pct: totalSlots ? Math.round((sums[fam] / totalSlots) * 100) : 0 }))
  }, [ribbon])

  // Filet de sécurité : ne devrait pas arriver (AuthenticatedApp bloque déjà via
  // user.departmentReady avant même de monter ce composant), mais évite un plantage plutôt
  // qu'un écran cassé si le département reste introuvable.
  if (!dept) return <DepartmentNotReady lang={lang} />

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{dept.nom}</h1>
        <p className="page-sub">{t(lang, 'forecast_select_project_hint')}</p>
      </div>

      <div className="info-bar">
        <div className="info-bar-item">
          <span className="info-bar-label">{t(lang, 'kpi_effectif_visible')}</span>
          <span className="info-bar-value">{kpis.effectif}</span>
        </div>
        <div className="info-bar-item">
          <span className="info-bar-label">{t(lang, 'kpi_prod')}</span>
          <span className="info-bar-value">{kpis.prodPct}%</span>
        </div>
        <div className="info-bar-item">
          <span className="info-bar-label">{t(lang, 'kpi_bench')}</span>
          <span className="info-bar-value">{kpis.benchPct}%</span>
        </div>
        <div className="info-bar-item">
          <span className="info-bar-label">{t(lang, 'kpi_absence')}</span>
          <span className="info-bar-value">{kpis.absPct}%</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset((w) => w - horizon)}>{t(lang, 'prev_week')}</button>
          <span className="week-range">{formatFrDate(toISODate(allDays[0]))} – {formatFrDate(toISODate(allDays[allDays.length - 1]))}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset((w) => w + horizon)}>{t(lang, 'next_week')}</button>
          {weekOffset !== 0 && <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>{t(lang, 'today')}</button>}
          <div className="segmented" role="group" aria-label="Horizon">
            {([1, 2, 4] as const).map((h) => (
              <button key={h} className={horizon === h ? 'active' : ''} onClick={() => setHorizon(h)}>
                {h} {lang === 'FR' ? 'sem.' : 'w'}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-left">
          {activeCode?.projetObligatoire && (
            <select className="select-pill" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
              <option value="">{t(lang, 'choose_active_project')}</option>
              {projects.filter((p) => p.statut === 'actif').map((p) => (
                <option key={p.code} value={p.code}>{p.code} · {p.nom} ({p.client})</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="code-palette" role="group" aria-label="Palette de codes d'activité">
          {activityCodes.map((c) => (
            <button
              key={c.code}
              className={`code-chip ${selectedCode === c.code ? 'selected' : ''}`}
              style={{ '--chip-color': c.couleur } as CSSProperties}
              onClick={() => setSelectedCode(c.code)}
              title={c.libelle}
            >
              {c.code}
            </button>
          ))}
          <button className={`code-chip eraser ${selectedCode === '__erase' ? 'selected' : ''}`} onClick={() => setSelectedCode('__erase')}>
            {t(lang, 'erase')}
          </button>
        </div>
        <div className="info-popover-wrap">
          <button className="info-toggle" onClick={() => setLegendOpen((v) => !v)} aria-label={t(lang, 'legend_toggle')}>i</button>
          {legendOpen && (
            <div className="info-popover" onMouseLeave={() => setLegendOpen(false)}>
              <div className="legend-row">
                {activityCodes.map((c) => (
                  <span key={c.code}><span className="legend-swatch" style={{ background: c.couleur }} />{c.code} — {c.libelle}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="ribbon-wrap card">
        <div className="card-title">{t(lang, 'ribbon_title')}</div>
        {familyTotals.map((f) => (
          <div key={f.fam} className="ribbon-family-row">
            <span className="ribbon-family-label">{FAMILY_LABEL[f.fam]}</span>
            <span className="ribbon-family-track">
              <span className="ribbon-family-fill" style={{ width: `${f.pct}%`, background: FAMILY_COLOR[f.fam] }} />
            </span>
            <span className="ribbon-family-pct">{f.pct}%</span>
          </div>
        ))}
        <button className="ribbon-detail-toggle" onClick={() => setRibbonDetailOpen((v) => !v)}>
          {ribbonDetailOpen ? t(lang, 'ribbon_hide_detail') : t(lang, 'ribbon_show_detail')}
        </button>
        {ribbonDetailOpen && (
          <div className="ribbon-bars">
            {ribbon.map((col, i) => (
              <div key={i} className="ribbon-col" title={`${col.dateISO} ${col.demi}`}>
                {Object.entries(col.counts).filter(([, v]) => v > 0).map(([fam, v]) => (
                  <div key={fam} style={{ height: `${(v / col.total) * 100}%`, background: fam === 'none' ? 'var(--cap-grey-light)' : FAMILY_COLOR[fam as Famille] }} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-scroll" style={{ marginTop: 4 }}>
        <table className="fgrid">
          <thead>
            <tr className="week-row">
              <th className="name-col">{t(lang, 'collaborateur_col')}</th>
              {weeks.map((w, i) => (
                <th key={i} colSpan={w.days.length * 2}>
                  <span style={{ marginRight: 8 }}>{w.label}</span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => copyWeek(i)}>
                    {t(lang, 'copy_week')}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '1px 6px', fontSize: 10, marginLeft: 4 }}
                    disabled={!copiedWeek}
                    onClick={() => pasteWeek(i)}
                  >
                    {t(lang, 'paste_week')}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="day-row">
              <th className="name-col" />
              {allDays.map((d) => (
                <th key={toISODate(d)} colSpan={2}>{formatFrDate(toISODate(d))}</th>
              ))}
            </tr>
            <tr className="day-row">
              <th className="name-col" />
              {allDays.map((d) => (
                <Fragment key={toISODate(d)}>
                  <th style={{ cursor: 'pointer' }} onClick={() => fillColumn(toISODate(d), 'AM')}>AM</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => fillColumn(toISODate(d), 'PM')}>PM</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody onMouseUp={() => setPainting(false)} onMouseLeave={() => setPainting(false)}>
            {visibleRows.map((node) => {
              const emp = findEmployee(employees, node.pernr)!
              const isManager = node.children.length > 0
              return (
                <tr
                  key={node.pernr}
                  id={`fg-row-${node.pernr}`}
                  className={isManager ? 'manager-row' : 'leaf-row'}
                >
                  <td className="name-col" style={{ paddingLeft: 10 + node.depth * 16 }}>
                    <div className="name-col-inner">
                      {isManager && (
                        <button className="tree-toggle" onClick={() => setCollapsed((c) => ({ ...c, [node.pernr]: !c[node.pernr] }))}>
                          {collapsed[node.pernr] ? '▸' : '▾'}
                        </button>
                      )}
                      <span>
                        {emp.nom}{' '}
                        <span className="pernr-tag">#{emp.pernr}</span>
                        {emp.statut === 'Unpaid Leave' && <span className="pernr-tag"> · {t(lang, 'unpaid_leave_tag')}</span>}
                      </span>
                      {!isManager && (
                        <span className={`row-menu-wrap ${openRowMenu === node.pernr ? 'open' : ''}`}>
                          <button
                            className="row-menu-btn"
                            aria-label={t(lang, 'row_actions')}
                            onClick={(e) => { e.stopPropagation(); setOpenRowMenu(openRowMenu === node.pernr ? null : node.pernr) }}
                          >
                            ⋮
                          </button>
                          {openRowMenu === node.pernr && (
                            <div className="row-menu">
                              <button onClick={() => { fillRow(node.pernr); setOpenRowMenu(null) }}>{t(lang, 'fill_row')}</button>
                              <button onClick={() => { copyRow(node.pernr); setOpenRowMenu(null) }}>{t(lang, 'copy_row')}</button>
                              <button disabled={!copiedRow} onClick={() => { pasteRow(node.pernr); setOpenRowMenu(null) }}>{t(lang, 'paste_row')}</button>
                              <div className="row-menu-divider" />
                              <button onClick={() => { eraseRow(node.pernr); setOpenRowMenu(null) }}>{t(lang, 'clear_row')}</button>
                            </div>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  {allDays.map((d) => {
                    const dateISO = toISODate(d)
                    return (
                      <Fragment key={dateISO}>
                        {(['AM', 'PM'] as const).map((demi) => {
                          const e = isManager ? undefined : cellValue(node.pernr, dateISO, demi)
                          const code = e ? resolveActivityCode(e, activityCodes) : undefined
                          const project = e?.projectCode ? projects.find((p) => p.code === e.projectCode) : undefined
                          const isFocused = focusedCell?.pernr === node.pernr && focusedCell.dateISO === dateISO && focusedCell.demi === demi
                          return (
                            <td
                              key={dateISO + demi}
                              id={`fg-cell-${node.pernr}-${dateISO}-${demi}`}
                              className={`cell ${isFocused ? 'focused' : ''}`}
                              tabIndex={isManager ? -1 : 0}
                              style={code ? { background: hexToRgba(code.couleur, 0.16), borderLeft: `3px solid ${code.couleur}` } : undefined}
                              title={code ? `${code.libelle}${project ? ' — ' + project.code + ' · ' + project.nom : ''}` : t(lang, 'not_filled')}
                              onFocus={() => { if (!isManager) setFocusedCell({ pernr: node.pernr, dateISO, demi }) }}
                              onMouseDown={() => {
                                if (isManager) return
                                setPainting(true)
                                applyPaint(node.pernr, dateISO, demi)
                              }}
                              onMouseEnter={() => {
                                if (isManager || !painting) return
                                applyPaint(node.pernr, dateISO, demi)
                              }}
                              onKeyDown={(ev) => {
                                if (isManager) return
                                const rowIdx = leafPernrs.indexOf(node.pernr)
                                const colIdx = cellCols.findIndex((c) => c.dateISO === dateISO && c.demi === demi)
                                if (ev.key === 'ArrowRight') { ev.preventDefault(); focusCellAt(rowIdx, colIdx + 1) }
                                else if (ev.key === 'ArrowLeft') { ev.preventDefault(); focusCellAt(rowIdx, colIdx - 1) }
                                else if (ev.key === 'ArrowDown') { ev.preventDefault(); focusCellAt(rowIdx + 1, colIdx) }
                                else if (ev.key === 'ArrowUp') { ev.preventDefault(); focusCellAt(rowIdx - 1, colIdx) }
                                else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); applyPaint(node.pernr, dateISO, demi) }
                                else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); eraseCell(node.pernr, dateISO, demi) }
                                else if (ev.key === 'Escape') { ev.preventDefault(); setFocusedCell(null); (ev.target as HTMLElement).blur() }
                              }}
                            >
                              {code && <span className="cell-code">{code.code}</span>}
                            </td>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
