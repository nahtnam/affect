import { useActionState } from 'react'

import { Button } from '#/components/ui/button'

import { authClient } from './client'

export const SignOut = () => {
  const [error, action, pending] = useActionState(async () => {
    try {
      const result = await authClient.signOut()

      if (result.error === null) {
        window.location.replace('/')

        return null
      }
    } catch {
      // Show the same retry message without exposing transport details.
    }

    return "Couldn't sign out. Please try again."
  }, null)

  return (
    <form action={action} className="flex items-center gap-2">
      {error === null ? null : (
        <span className="text-destructive text-sm" role="alert">
          {error}
        </span>
      )}
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
    </form>
  )
}
