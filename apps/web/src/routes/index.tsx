import { createFileRoute } from '@tanstack/react-router'

const Home = () => (
  <div className="mx-auto w-full max-w-5xl px-6 py-16">
    <h1 className="text-2xl font-semibold tracking-tight">Affect</h1>
  </div>
)

export const Route = createFileRoute('/')({
  component: Home,
})
