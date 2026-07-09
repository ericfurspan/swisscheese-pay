import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

export function Nav() {
  const { logout } = useAuth()

  return (
    <nav>
      <Link to="/dashboard">Dashboard</Link>
      {' | '}
      <Link to="/transfer">Transfer</Link>
      {' | '}
      <Link to="/payment-links">Payment Links</Link>
      {' | '}
      <Link to="/profile">Profile</Link>
      {' | '}
      <button type="button" onClick={() => void logout()}>
        Log out
      </button>
    </nav>
  )
}
