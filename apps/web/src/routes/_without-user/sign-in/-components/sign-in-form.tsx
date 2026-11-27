import { useActionState } from 'react'
import { Predicate, String } from 'effect'

import { authClient } from '#/auth/client'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'

type CodeError = {
  code?: string | undefined
  message?: string | undefined
  status?: number | undefined
}

type RequestCode = (email: string) => Promise<{ error: CodeError | null }>

type SignInState = {
  email: string
  error: string | null
  sent: boolean
}

const initialState: SignInState = {
  email: '',
  error: null,
  sent: false,
}

const formString = (value: FormDataEntryValue | null) => (Predicate.isString(value) ? value : '')

const codeErrorMessage = (error: CodeError, fallback: string) => {
  switch (error.code ?? '') {
    case 'INVALID_EMAIL': {
      return 'Enter a valid email address.'
    }

    case 'OTP_EXPIRED': {
      return 'This code has expired. Request a new one.'
    }

    case 'INVALID_OTP': {
      return 'That code didn’t match. Try again.'
    }

    case 'TOO_MANY_ATTEMPTS': {
      return 'Too many attempts. Request a new code.'
    }

    default: {
      if (error.message === 'Enter a valid email address.') {
        return 'Enter a valid email address.'
      }

      if (error.status === 429 || error.message === 'Too many requests. Please try again later.') {
        return 'Too many requests. Try again later.'
      }

      return fallback
    }
  }
}

const submit = async (
  returnTo: string,
  requestCode: RequestCode,
  state: SignInState,
  form: FormData,
): Promise<SignInState> => {
  const action = form.get('action')

  if (action === 'change') {
    return initialState
  }

  const emailValue = form.get('email')
  const otpValue = form.get('otp')
  const { email: stateEmail, sent } = state
  let email = stateEmail

  if (!sent) {
    email = String.toLowerCase(String.trim(formString(emailValue)))
  }

  const verify = action === 'verify'

  const fallback = verify
    ? 'Couldn’t verify the code. Try again.'
    : 'Couldn’t send a sign-in code. Try again.'

  try {
    const result = verify
      ? await authClient.signIn.emailOtp({
          email,
          otp: formString(otpValue),
        })
      : await requestCode(email)

    if (result.error !== null) {
      return {
        ...state,
        email,
        error: codeErrorMessage(result.error, fallback),
      }
    }

    if (verify) {
      window.location.replace(returnTo)
    }

    return {
      email,
      error: null,
      sent: true,
    }
  } catch {
    return {
      ...state,
      email,
      error: fallback,
    }
  }
}

export const SignInForm = ({
  returnTo,
  requestCode,
}: {
  returnTo: string
  requestCode: RequestCode
}) => {
  const [state, action, pending] = useActionState(
    submit.bind(null, returnTo, requestCode),
    initialState,
  )

  return (
    <section className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to your account</h1>
        <p className="text-muted-foreground text-sm">
          Use your email address and we&apos;ll send you a one-time code.
        </p>
      </div>
      {state.error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <form action={action} className="flex flex-col gap-4">
        {state.sent ? (
          <Field>
            <FieldLabel htmlFor="otp">Verification code</FieldLabel>
            <Input
              autoComplete="one-time-code"
              autoFocus
              aria-describedby="otp-description"
              disabled={pending}
              id="otp"
              name="otp"
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              placeholder="000000"
              required
            />
            <FieldDescription id="otp-description">
              Enter the code for <span className="font-medium">{state.email}</span>.
            </FieldDescription>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="email">Email address</FieldLabel>
            <Input
              autoComplete="email"
              autoFocus
              defaultValue={state.email}
              disabled={pending}
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </Field>
        )}
        <Button
          disabled={pending}
          name="action"
          type="submit"
          value={state.sent ? 'verify' : 'send'}
        >
          {pending ? <Spinner /> : null}
          {state.sent ? 'Verify code' : 'Send code'}
        </Button>
        {state.sent ? (
          <>
            <Button
              disabled={pending}
              formNoValidate
              name="action"
              type="submit"
              value="resend"
              variant="outline"
            >
              Resend code
            </Button>
            <Button
              disabled={pending}
              formNoValidate
              name="action"
              type="submit"
              value="change"
              variant="ghost"
            >
              Change email
            </Button>
          </>
        ) : null}
      </form>
    </section>
  )
}
