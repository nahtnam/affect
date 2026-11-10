import { Spinner } from '#/components/ui/spinner'

export const RoutePending = () => (
  <output aria-label="Loading page" className="grid flex-1 place-items-center">
    <Spinner />
  </output>
)
