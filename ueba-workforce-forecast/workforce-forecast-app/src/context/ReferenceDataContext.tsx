import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ActivityCode, Department, Direction, Employee, Project } from '../types'
import { listActivityCodes, listDepartments, listDirections, listEmployees, listProjects } from '../api/referenceApi'
import { getToken } from '../auth/session'

interface ReferenceData {
  directions: Direction[]
  departments: Department[]
  employees: Employee[]
  projects: Project[]
  activityCodes: ActivityCode[]
  loading: boolean
  refetchEmployees: () => Promise<void>
  refetchProjects: () => Promise<void>
}

const ReferenceDataContext = createContext<ReferenceData | null>(null)

export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const [directions, setDirections] = useState<Direction[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [activityCodes, setActivityCodes] = useState<ActivityCode[]>([])
  const [loading, setLoading] = useState(true)

  const refetchEmployees = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setEmployees(await listEmployees(token))
  }, [])

  const refetchProjects = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setProjects(await listProjects(token))
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      listDirections(token),
      listDepartments(token),
      listEmployees(token),
      listProjects(token),
      listActivityCodes(token),
    ])
      .then(([d, dep, emp, proj, codes]) => {
        setDirections(d)
        setDepartments(dep)
        setEmployees(emp)
        setProjects(proj)
        setActivityCodes(codes)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <ReferenceDataContext.Provider
      value={{ directions, departments, employees, projects, activityCodes, loading, refetchEmployees, refetchProjects }}
    >
      {children}
    </ReferenceDataContext.Provider>
  )
}

export function useReferenceData(): ReferenceData {
  const ctx = useContext(ReferenceDataContext)
  if (!ctx) throw new Error('useReferenceData doit être utilisé sous ReferenceDataProvider')
  return ctx
}
