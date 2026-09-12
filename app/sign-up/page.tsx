import Link from 'next/link'
import { AuthForm } from '@/components/auth-form'

export default function SignUpPage() {
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="flex flex-col items-center gap-4"><AuthForm mode="sign-up" /><Link href="/sign-in" className="text-sm text-muted-foreground underline underline-offset-4">Already have an account?</Link></div></main>
}
