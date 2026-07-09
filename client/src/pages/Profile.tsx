import { useState, type FormEvent } from 'react'
import { api } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'
import { Nav } from '../components/Nav.js'

export function ProfilePage() {
  const { user } = useAuth()
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      await api.patch('/profile', { full_name: fullName })
      setSuccess('Profile updated')
    } catch {
      setError('Could not update profile')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <div>
      <Nav />
      <h1>Profile</h1>
      <p>Email: {user.email}</p>
      <p>SSN: {user.ssn}</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="full_name">Full name</label>
        <input
          id="full_name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">{success}</p>}
        <button type="submit" disabled={submitting}>
          Save
        </button>
      </form>
    </div>
  )
}
