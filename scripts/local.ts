/// <reference types="bun" />
import { Database } from 'bun:sqlite'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawn } from 'node:child_process'
import nodePath from 'node:path'
import { localReply, isSupervisor, parseRun, portNumber, servicePorts } from './local-state'

const root = nodePath.resolve(import.meta.dir, '..')
const state = nodePath.join(root, '.setup.local')
const script = import.meta.path
const binary = nodePath.join(state, 'convex-local-backend')
const runFile = nodePath.join(state, 'run')
const loopback = '127.0.0.1'
const origin = (port: number) => `http://${loopback}:${portNumber(port)}`

const environment = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: nodePath.join(state, 'home'),
  CI: 'true',
}

const delay = () => Bun.sleep(150)
const read = (path: string) => readFileSync(path, 'utf-8')

const save = (path: string, value: string) => {
  const temp = `${path}.${randomUUID()}`
  writeFileSync(temp, value, { mode: 0o600, flag: 'wx' })
  renameSync(temp, path)
}

const owned = (run: ReturnType<typeof parseRun>) => {
  const result = Bun.spawnSync(['/bin/ps', '-ww', '-p', String(run.pid), '-o', 'command='], {
    env: environment,
  })

  return result.success && isSupervisor({ command: result.stdout.toString(), script, id: run.id })
}

const stop = async () => {
  if (!existsSync(runFile)) {
    return
  }

  const run = parseRun(read(runFile))

  if (owned(run)) {
    save(nodePath.join(state, `stop-${run.id}`), '')

    for (let attempt = 0; owned(run); attempt += 1) {
      if (attempt > 120) {
        throw new Error('Local supervisor did not stop.')
      }

      await delay()
    }
  }

  rmSync(nodePath.join(state, `stop-${run.id}`), { force: true })
  rmSync(runFile)
}

const responding = async (url: string) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' })
    await response.body?.cancel()

    return response.ok
  } catch {
    return false
  }
}

const start = async () => {
  if (existsSync(runFile)) {
    const run = parseRun(read(runFile))

    if (owned(run) && existsSync(nodePath.join(state, 'ready'))) {
      const [cloud, web] = read(nodePath.join(state, 'ready')).split(' ').map(Number)

      if (
        cloud !== undefined &&
        web !== undefined &&
        (await responding(`${origin(cloud)}/version`)) &&
        (await responding(origin(web)))
      ) {
        return origin(web)
      }
    }

    await stop()
  }

  const failure = nodePath.join(state, 'failure')
  rmSync(failure, { force: true })
  rmSync(nodePath.join(state, 'ready'), { force: true })
  const id = randomUUID()
  const log = openSync(nodePath.join(state, 'runtime.log'), 'w', 0o600)

  const supervisor = spawn(process.execPath, ['--no-env-file', script, 'supervise', id], {
    cwd: root,
    detached: true,
    stdio: ['ignore', log, log],
    env: environment,
  })

  closeSync(log)

  if (supervisor.pid === undefined) {
    throw new Error('Could not launch the local supervisor.')
  }

  supervisor.unref()
  save(runFile, `${supervisor.pid} ${id}`)

  try {
    for (let attempt = 0; attempt < 1200; attempt += 1) {
      if (!owned({ pid: supervisor.pid, id })) {
        const stage = existsSync(failure) ? read(failure) : 'launching supervisor'
        throw new Error(`Local startup failed while ${stage}. See .setup.local/runtime.log.`)
      }

      if (existsSync(nodePath.join(state, 'ready'))) {
        return origin(Number(read(nodePath.join(state, 'ready')).split(' ')[1]))
      }

      await delay()
    }

    throw new Error('Local startup timed out. See .setup.local/runtime.log.')
  } catch (error) {
    await stop()
    throw error
  }
}

type Operation = 'seed' | 'count' | 'code'

const localRequest = async (operation: Operation) => {
  if (!existsSync(runFile) || !owned(parseRun(read(runFile)))) {
    throw new Error('This checkout has no running local instance. Run local:start first.')
  }

  const reply = await fetch(`http://localhost/${operation}`, {
    unix: './control.sock',
    method: 'POST',
    redirect: 'error',
  })

  if (!reply.ok) {
    throw new Error(`Local ${operation} failed.`)
  }

  process.stdout.write(`${await reply.text()}\n`)
}

const supervise = async (id: string) => {
  process.umask(0o077)
  const children = new Set<Bun.Subprocess>()

  const launch = (cmd: string[], env = {}, cwd = root) => {
    const child = Bun.spawn(cmd, {
      cwd,
      env: { ...environment, ...env },
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    })

    children.add(child)

    return child
  }

  let interrupted = false

  const interrupt = () => {
    interrupted = true
  }

  process.once('SIGTERM', interrupt)
  process.once('SIGINT', interrupt)

  const stopped = () => interrupted || existsSync(nodePath.join(state, `stop-${id}`))

  const check = () => {
    if (stopped()) {
      throw new Error('Stop requested.')
    }

    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error('Local service exited.')
      }
    }
  }

  const waitReady = async (url: string) => {
    while (!(await responding(url))) {
      check()
      await delay()
    }

    check()
  }

  let stage = 'allocating ports'

  try {
    const ports = Array.from({ length: 3 }, () =>
      Bun.serve({ hostname: loopback, port: 0, fetch: () => new Response() }),
    )

    const { cloud, site, web } = servicePorts(ports.map((server) => Number(server.port)))
    await Promise.all(ports.map((server) => server.stop(true)))

    const secret = (name: string) => {
      const path = nodePath.join(state, name)

      if (!existsSync(path)) {
        save(path, randomBytes(32).toString('hex'))
      }

      return read(path)
    }

    stage = 'generating local credentials'
    const instance = 'affect-local'
    const identity = ['--instance-name', instance, '--instance-secret', secret('instance')]
    const key = Bun.spawnSync([binary, 'keygen', 'admin-key', ...identity], { env: environment })
    const admin = key.stdout.toString().trim()

    if (!key.success || !admin.startsWith(`${instance}|`)) {
      throw new Error('Local key generation failed.')
    }

    stage = 'starting the local backend'
    launch(
      [
        binary,
        ...identity,
        '--interface',
        loopback,
        '--port',
        String(cloud),
        '--site-proxy-port',
        String(site),
        '--convex-origin',
        origin(cloud),
        '--convex-site',
        origin(site),
        '--disable-beacon',
        '--local-storage',
        nodePath.join(state, 'storage'),
        nodePath.join(state, 'backend.sqlite3'),
      ],
      {},
      state,
    )
    await waitReady(`${origin(cloud)}/version`)
    const target = nodePath.join(state, 'target')
    save(target, `CONVEX_SELF_HOSTED_URL=${origin(cloud)}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${admin}\n`)
    const settings = nodePath.join(state, 'settings')
    save(
      settings,
      `SITE_URL=${origin(web)}\nTRUSTED_ORIGINS=${origin(web)}\nBETTER_AUTH_SECRET=${secret('auth')}\nCLOUDFLARE_ACCOUNT_ID=\nCLOUDFLARE_API_TOKEN=\nEMAIL_FROM=\nPOSTHOG_PROJECT_TOKEN=\n`,
    )

    for (const args of [
      ['env', 'set', '--force', '--from-file', settings],
      ['deploy', '--codegen', 'disable', '--typecheck', 'disable'],
    ]) {
      stage = `running local Convex ${args[0]}`

      const cli = launch([
        'node',
        nodePath.join(root, 'node_modules/convex/bin/main.js'),
        ...args,
        '--env-file',
        target,
      ])

      while (cli.exitCode === null && cli.signalCode === null && !stopped()) {
        await delay()
      }

      if (stopped() || (await cli.exited) !== 0) {
        throw new Error('Local Convex configuration or sync failed.')
      }

      children.delete(cli)
    }

    stage = 'starting the web app'
    launch(
      ['node', nodePath.join(root, 'node_modules/vite/bin/vite.js'), 'dev'],
      {
        AFFECT_LOCAL: '1',
        PORT: String(web),
        VITE_SITE_URL: origin(web),
        SITE_URL: origin(web),
        TRUSTED_ORIGINS: origin(web),
        VITE_CONVEX_URL: origin(cloud),
        VITE_CONVEX_SITE_URL: origin(site),
      },
      nodePath.join(root, 'apps/web'),
    )
    await waitReady(origin(web))
    // Use the credentials and loopback port of this live supervisor.
    rmSync('control.sock', { force: true })

    const control = Bun.serve({
      unix: './control.sock',
      async fetch(request) {
        const path = new URL(request.url).pathname

        const routes = new Map([
          ['/seed', 'seed/populate'],
          ['/count', 'seed/count'],
          ['/code', 'developmentEmail/send'],
        ])

        const route = routes.get(path)

        if (request.method !== 'POST' || route === undefined) {
          return new Response(null, { status: 404 })
        }

        const args =
          path === '/code'
            ? { cloudUrl: origin(cloud), origin: origin(web), email: 'demo@example.test' }
            : {}

        const reply = await fetch(`${origin(cloud)}/api/run/${route}`, {
          method: 'POST',
          redirect: 'error',
          headers: { authorization: `Convex ${admin}`, 'Content-Type': 'application/json' },
          body: Response.json({ args, format: 'json' }).body,
        })

        if (!reply.ok) {
          return new Response(null, { status: 503 })
        }

        const message = localReply({ path, raw: await reply.json() })

        return new Response(message, { status: message === null ? 503 : 200 })
      },
    })

    save(nodePath.join(state, 'ready'), `${cloud} ${web}`)

    while (!stopped()) {
      check()
      await delay()
    }

    await control.stop(true)
  } catch (error) {
    save(nodePath.join(state, 'failure'), stage)
    throw error
  } finally {
    // Only signal live native child handles held by their original parent.
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
      }
    }

    await Promise.all([...children].map((child) => child.exited))
  }
}

if (existsSync(state) && lstatSync(state).isSymbolicLink()) {
  throw new Error('Unsafe local state directory.')
}

mkdirSync(state, { recursive: true, mode: 0o700 })

process.chdir(state)

mkdirSync(environment.HOME, { recursive: true, mode: 0o700 })

const [command, id] = process.argv.slice(2)

if (command === 'supervise' && id !== undefined) {
  await supervise(id)
} else {
  const lock = new Database(nodePath.join(state, 'lifecycle.sqlite'))

  try {
    lock.run('PRAGMA busy_timeout = 200000')
    lock.run('BEGIN IMMEDIATE')

    if (command === 'start') {
      const url = await start()

      if (id === '--seed') {
        await localRequest('seed')
      }

      process.stdout.write(`URL=${url}\n`)
    } else if (command === 'seed' || command === 'count' || command === 'code') {
      await localRequest(command)
    } else if (command === 'reset') {
      await stop()

      for (const name of [
        'backend.sqlite3',
        'backend.sqlite3-wal',
        'backend.sqlite3-shm',
        'backend.sqlite3-journal',
        'storage',
        'auth',
        'instance',
        'settings',
        'target',
        'runtime.log',
        'ready',
        'failure',
        'control.sock',
      ]) {
        rmSync(nodePath.join(state, name), { recursive: true, force: true })
      }
    } else if (command === 'stop') {
      await stop()
    } else {
      throw new Error('Expected start or stop.')
    }
  } finally {
    lock.close()
  }
}
