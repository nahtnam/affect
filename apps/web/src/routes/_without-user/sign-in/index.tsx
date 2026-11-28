import { createFileRoute } from '@tanstack/react-router'

import { authClient } from '#/auth/client'
import { safeReturnTo } from '#/auth/return-to'
import { SignInForm } from './-components/sign-in-form'

const requestCode = async (email: string) => {
  if (import.meta.env.DEV || import.meta.env.AFFECT_PREVIEW_INBOX) {
    const devEmail = await import('#/affect-dev/client')

    if (import.meta.env.AFFECT_PREVIEW_INBOX || (await devEmail.developmentEmailAvailable())) {
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

export const Route = createFileRoute('/_without-user/sign-in/')({
  component: SignIn,
  validateSearch: (search): { returnTo?: string } => {
    const { returnTo } = search

    return returnTo === undefined ? {} : { returnTo: safeReturnTo({ returnTo }) }
  },
})
