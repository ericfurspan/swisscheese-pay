import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.js'
import { LoginPage } from './pages/Login.js'

// Only /login exists so far -- everything else redirects there. More routes
// (Dashboard, Account, Transfer, PaymentLink, Profile) land in a later pass;
// this deliberately doesn't route to pages that don't exist yet.
export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
