import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'admin' | 'empleado'

export interface AuthUser {
  id: number
  username: string
  role: UserRole
  branch_id: number | null
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  activeBranchId: number | null
  login: (token: string, user: AuthUser) => void
  logout: () => void
  setActiveBranch: (branchId: number) => void
}

/** First use of Zustand's `persist` middleware in this codebase — the
 * session (token/user/active branch) needs to survive a page reload, which
 * `persist` handles more reliably than hand-rolling `useEffect` +
 * `localStorage` the way `ThemeProvider.tsx` does for the theme alone. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      activeBranchId: null,

      login: (token, user) =>
        set({
          token,
          user,
          // An empleado is always locked to their own branch; an admin keeps
          // whatever active branch they had (or none yet, until they pick one).
          activeBranchId: user.role === 'empleado' ? user.branch_id : get().activeBranchId,
        }),

      logout: () => set({ token: null, user: null, activeBranchId: null }),

      setActiveBranch: (branchId) => {
        // Empleados can never change their fixed branch.
        if (get().user?.role !== 'admin') return
        set({ activeBranchId: branchId })
      },
    }),
    { name: 'pos-auth' },
  ),
)
