import { createFileRoute } from '@tanstack/react-router'

import { authClient } from '#/auth/client'
import { safeReturnTo } from '#/auth/return-to'
import { SignInForm } from '#/auth/sign-in-form'

const requestCode = async (email: string) => {
  if (import.meta.env.DEV) {
    const devEmail = await import('#/affect-dev/client')

    if (await devEmail.developmentEmailAvailable()) {
      return await devEmail.sendDevelopmentCode(email)
    }
  }

  return await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
}

const SignIn = () => {
  const { returnTo } = Route.useSearch()

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <SignInForm requestCode={requestCode} returnTo={safeReturnTo({ returnTo })} />
    </div>
  )
}

export const Route = createFileRoute('/_signed-out/sign-in')({
  component: SignIn,
  validateSearch: (search): { returnTo?: string } => {
    const { returnTo } = search

    return returnTo === undefined ? {} : { returnTo: safeReturnTo({ returnTo }) }
  },
})
