import type { Role } from './types'

export const ROLE_LOGIN_PATHS: Record<Role, string> = {
  ADMIN: '/login/admin',
  EUM_EUD: '/login/eum',
  HEAD_OF_DIRECTION: '/login/head-direction',
}

export function roleFromPath(pathname: string): Role | null {
  const entry = (Object.entries(ROLE_LOGIN_PATHS) as [Role, string][]).find(([, path]) => path === pathname)
  return entry ? entry[0] : null
}
