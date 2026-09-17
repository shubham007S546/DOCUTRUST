'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim().toLowerCase()
    const password = String(data.get('password') ?? '')
    const name = String(data.get('name') ?? '').trim()
    if (mode === 'sign-up' && password.length < 8) {
      setPending(false)
      setError('Password must be at least 8 characters.')
      return
    }
    try {
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password })
      setPending(false)
      if (result.error) {
        const code = String(result.error.code ?? '')
        if (code === 'USER_ALREADY_EXISTS' || code === 'EMAIL_ALREADY_EXISTS') {
          setError('An account already exists for this email. Use Sign in instead.')
        } else if (code === 'INVALID_EMAIL') {
          setError('Enter a valid email address.')
        } else if (code === 'INVALID_PASSWORD') {
          setError('The password is incorrect. Check it and try again.')
        } else {
          setError(mode === 'sign-up' ? 'The account could not be created. Try a different email or sign in if you already registered.' : 'The email or password is incorrect.')
        }
        return
      }
    } catch {
      setPending(false)
      setError('Authentication is temporarily unavailable. Please try again.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
    <div><h1 className="text-xl font-semibold">{mode === 'sign-up' ? 'Create your workspace' : 'Sign in to DocuTrust'}</h1><p className="mt-1 text-sm text-muted-foreground">Private workspaces use encrypted server-side sessions.</p></div>
    {mode === 'sign-up' && <label className="flex flex-col gap-2 text-sm">Name<input name="name" required className="rounded-md border bg-background px-3 py-2" autoComplete="name" /></label>}
    <label className="flex flex-col gap-2 text-sm">Email<input name="email" type="email" required className="rounded-md border bg-background px-3 py-2" autoComplete="email" /></label>
    <label className="flex flex-col gap-2 text-sm">Password<input name="password" type="password" minLength={8} required className="rounded-md border bg-background px-3 py-2" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} /></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button disabled={pending} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60">{pending ? 'Working…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
  </form>
}
