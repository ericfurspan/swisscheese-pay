import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.js'
import { ProtectedRoute } from './components/ProtectedRoute.js'
import { AccountPage } from './pages/Account.js'
import { DashboardPage } from './pages/Dashboard.js'
import { LoginPage } from './pages/Login.js'
import { PaymentLinkPage } from './pages/PaymentLink.js'
import { ProfilePage } from './pages/Profile.js'
import { RegisterPage } from './pages/Register.js'
import { TransferPage } from './pages/Transfer.js'

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/accounts/:id" element={<AccountPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="/payment-links" element={<PaymentLinkPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
