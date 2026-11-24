import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { errorMessage } from '../api'
import { useAuth } from '../auth'

export function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username, password)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2 }}>
      <Paper sx={{ width: '100%', maxWidth: 420, p: 4 }}>
        <Typography variant="overline" color="primary">Abhishek Traders</Typography>
        <Typography variant="h5" sx={{ mb: 0.5 }}>Grain billing</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Rahatgarh, Madhya Pradesh</Typography>
        <Stack component="form" spacing={2} onSubmit={submit}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          <TextField label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </Stack>
      </Paper>
    </Box>
  )
}
