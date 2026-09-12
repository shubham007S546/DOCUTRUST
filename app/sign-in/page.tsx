import Link from 'next/link'
import { AuthForm } from '@/components/auth-form'

export default function SignInPage() {
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="flex flex-col items-center gap-4"><AuthForm mode="sign-in" /><Link href="/sign-up" className="text-sm text-muted-foreground underline underline-offset-4">Create a private workspace</Link></div></main>
}
