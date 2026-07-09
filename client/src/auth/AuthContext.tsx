import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client.js'
import { AuthContext, type Profile } from './useAuth.js'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<Profile>('/profile')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    await api.post('/auth/login', { email, password })
    setUser(await api.get<Profile>('/profile'))
  }

  async function register(email: string, password: string, fullName: string) {
    await api.post('/auth/register', { email, password, full_name: fullName })
    setUser(await api.get<Profile>('/profile'))
  }

  async function logout() {
    await api.post('/auth/logout')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
