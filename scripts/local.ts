import { Array as Arr, Predicate, Record, RegExp as Rx, Schema, String as Str } from 'effect'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as sleep } from 'node:timers/promises'

process.umask(0o077)

const root = path.resolve(import.meta.dirname, '..')
const setup = path.resolve(root, '.setup.local')
const state = path.resolve(setup, 'anonymous')
const home = path.resolve(setup, 'home')
const cli = path.resolve(root, 'node_modules/convex/bin/main.js')
const runtime = path.resolve(state, 'runtime.json')
const cache = path.join(home, '.cache/convex')
const versionFile = path.join(cache, 'backend-version')
const [action, argument] = process.argv.slice(2)

if (
  !fs.lstatSync(setup).isDirectory() ||
  (fs.existsSync(state) && !fs.lstatSync(state).isDirectory())
) {
  throw new Error('Local state must be a checkout directory.')
}

// An OS-released transaction lock also serializes reset with a concurrent start.
const lock = new DatabaseSync(path.resolve(setup, 'anonymous.lock.sqlite'))

lock.exec('PRAGMA busy_timeout=180000; BEGIN IMMEDIATE')

const env: NodeJS.ProcessEnv = {
  PATH: process.env['PATH'],
  HOME: home,
  CONVEX_AGENT_MODE: 'anonymous',
  CONVEX_DISABLE_TELEMETRY: '1',
  CI: 'true',
  NODE_USE_ENV_PROXY: '1',
}

const networkSetting =
  /^(?:https?_proxy|all_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|NODE_USE_SYSTEM_CA)$/iu

for (const [name, value] of Record.toEntries(process.env)) {
  if (networkSetting.test(name)) {
    env[name] = value
  }
}

env['NO_PROXY'] =
  `${process.env['no_proxy'] ?? ''},${process.env['NO_PROXY'] ?? ''},localhost,.localhost,*.localhost,127.0.0.1,[::1],::1`

env['no_proxy'] = env['NO_PROXY']

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const options = { cwd: state, env, encoding: 'utf-8' as const }

const run = (args: string[], input?: string) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    ...options,
    input,
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  assert.equal(result.status, 0, 'Convex command failed.')

  return Str.trim(result.stdout)
}

// The detached CLI leads its own process group. Match both its command and its PID.
const processPattern = `^${Rx.escape(process.execPath)} ${Rx.escape(cli)} dev `

const running = (pid: number) => {
  const match = spawnSync('pgrep', ['-g', String(pid), '-f', processPattern], { encoding: 'utf-8' })
  assert.ifError(match.error)

  return Str.trim(match.stdout) === String(pid)
}

// Convex detaches its --start command into a second process group. The backend
// command retains the checkout's database path even after the CLI crashes.
const localGroups = (pid?: number) => {
  const snapshot = spawnSync('ps', ['-axww', '-o', 'pid=,pgid=,command='], { encoding: 'utf-8' })
  assert.equal(snapshot.status, 0, 'Could not inspect local processes.')
  const groups = new Set<number>()
  const database = path.join(state, '.convex/local/default/convex_local_backend.sqlite3')
  const log = path.join(state, 'dev.log')

  for (const line of Str.split(snapshot.stdout, '\n')) {
    const { member, group, command } =
      /^\s*(?<member>\d+)\s+(?<group>\d+)\s+(?<command>.+)$/u.exec(line)?.groups ?? {}

    if (member === undefined || command === undefined || Number(group) <= 1) {
      continue
    }

    const backend =
      Str.startsWith(`${cache}/binaries/`)(command) &&
      Str.includes('/convex-local-backend ')(command) &&
      Str.endsWith(` ${database}`)(command)

    if (backend) {
      assert.equal(Number(group), pid, 'Cannot establish ownership of the local backend group.')
    }

    if (
      backend ||
      (Number(member) === pid &&
        Number(group) === pid &&
        new RegExp(processPattern, 'u').test(command))
    ) {
      groups.add(Number(group))
    }

    if (
      member === group &&
      command === `node ${root}/node_modules/vite/bin/vite.js` &&
      fs.existsSync(log)
    ) {
      // A manually started Vite in the same checkout does not inherit this log.
      const writer = spawnSync('lsof', ['-a', '-p', member, '-d', '1', '-t', '--', log], {
        encoding: 'utf-8',
      })

      assert.ifError(writer.error)

      if (writer.status === 0 && Str.trim(writer.stdout) === member) {
        groups.add(Number(group))
      }
    }
  }

  return groups
}

const stop = async (pid?: number) => {
  const groups = localGroups(pid)

  for (const group of groups) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
        throw error
      }
    }
  }

  for (const group of groups) {
    for (let attempt = 0; ; attempt += 1) {
      const members = spawnSync('pgrep', ['-g', String(group)], { encoding: 'utf-8' })

      if (members.status === 1) {
        break
      }

      assert.equal(members.status, 0, 'Could not inspect local process group.')
      assert.ok(attempt < 150, 'Local process group did not stop.')
      await sleep(100)
    }
  }

  fs.rmSync(runtime, { force: true })
}

const freePort = async () => {
  const server = createServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()

  assert.ok(address !== null && !Predicate.isString(address), 'No loopback port available.')

  const { port } = address
  server.close()

  return port
}

const dev = ['dev', '--codegen', 'disable', '--typecheck', 'disable']

const shutdown = new AbortController()
let foregroundExit: Promise<unknown> | undefined

if (action === 'dev') {
  // Bun can receive a signal at its PID alone and exit without signaling this process.
  const parent = process.ppid

  const watchParent = async () => {
    while (!shutdown.signal.aborted && process.ppid === parent && process.ppid !== 1) {
      await sleep(200, undefined, { ref: false })
    }

    shutdown.abort()
  }

  void watchParent()

  process.on('SIGINT', () => {
    shutdown.abort()
  })
  process.on('SIGTERM', () => {
    shutdown.abort()
  })
}

const start = async () => {
  const port = await freePort()
  const hostname = Str.slice(0, 16)(createHash('sha256').update(root).digest('hex'))
  const origin = `http://${hostname}.localhost:${port}`
  const marker = path.resolve(state, 'configured')

  const settings = [
    `SITE_URL=${origin}`,
    `TRUSTED_ORIGINS=${origin}`,
    'EMAIL_FROM=',
    'CLOUDFLARE_ACCOUNT_ID=',
    'CLOUDFLARE_API_TOKEN=',
    'POSTHOG_PROJECT_TOKEN=',
  ]

  if (!fs.existsSync(marker)) {
    settings.push(`BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}`)
  }

  run(['env', 'set', '--force'], `${Arr.join(settings, '\n')}\n`)
  fs.writeFileSync(marker, '')
  const log = fs.openSync(path.resolve(state, 'dev.log'), 'w')

  const vite =
    'cd "$AFFECT_ROOT/apps/web" && exec node "$AFFECT_ROOT/node_modules/vite/bin/vite.js"'

  const version = fs.readFileSync(versionFile, 'utf-8')
  const args = [cli, ...dev, '--local-backend-version', version, '--start', vite]

  const frontend = {
    AFFECT_ROOT: root,
    AFFECT_LOCAL: '1',
    PORT: String(port),
    SITE_URL: origin,
    VITE_SITE_URL: origin,
    TRUSTED_ORIGINS: origin,
  }

  const child = spawn(process.execPath, args, {
    cwd: state,
    env: { ...env, ...frontend },
    detached: true,
    stdio: ['ignore', log, log],
  })

  fs.closeSync(log)

  if (action === 'dev') {
    const exited = once(child, 'exit')
    foregroundExit = Promise.race([exited, once(shutdown.signal, 'abort')])
  } else {
    child.unref()
  }

  assert.ok(child.pid !== undefined, 'Failed to start Convex.')

  const data = { pid: child.pid, origin }
  fs.writeFileSync(runtime, json(data))

  for (let i = 0; i < 600 && child.exitCode === null && child.signalCode === null; i += 1) {
    const probe = spawnSync(
      'curl',
      ['-fsS', '--max-time', '2', '--noproxy', '*', `http://127.0.0.1:${port}`],
      { stdio: 'ignore' },
    )

    if (shutdown.signal.aborted || probe.status === 0) {
      return data
    }

    await sleep(250)
  }

  await stop(child.pid)
  throw new Error(`Local startup failed. See ${state}/dev.log`)
}

const saved = Schema.decodeSync(
  Schema.fromJsonString(Schema.Struct({ pid: Schema.Int, origin: Schema.String })),
)

let data = fs.existsSync(runtime) ? saved(fs.readFileSync(runtime, 'utf-8')) : undefined

if (action === 'setup') {
  // Warm both CLI downloads against an empty project. A repeat setup never pushes to app data.
  assert.ok(argument !== undefined, 'Setup requires a staging directory.')

  const downloadLock = new DatabaseSync(path.join(cache, 'setup.sqlite'))
  downloadLock.exec('PRAGMA busy_timeout=180000; BEGIN IMMEDIATE')

  const versionArgs = fs.existsSync(versionFile)
    ? ['--local-backend-version', fs.readFileSync(versionFile, 'utf-8')]
    : []

  const cloudPort = String(await freePort())
  const sitePort = String(await freePort())
  const ports = ['--local-cloud-port', cloudPort, '--local-site-port', sitePort]
  const warm = [cli, ...dev, ...versionArgs, ...ports, '--start', 'kill -INT "$PPID"']

  const result = spawnSync(process.execPath, warm, {
    ...options,
    cwd: argument,
    env: { ...env, CONVEX_VERBOSE: '1' },
    timeout: 180_000,
  })

  const version = /Ensuring backend binary downloaded for version (?<version>\S+)/u.exec(
    result.stderr,
  )?.groups?.['version']

  assert.ok(result.status === 130 && version !== undefined, 'Convex local backend setup failed.')

  if (!fs.existsSync(state)) {
    fs.writeFileSync(path.join(argument, 'convex.json'), json({ functions: '../../convex' }))
    fs.renameSync(argument, state)
  }

  fs.writeFileSync(versionFile, version)
  downloadLock.close()
} else if (action === 'stop-owned') {
  if (data?.pid === Number(argument)) {
    await stop(data?.pid)
  }
} else if (action === 'stop' || action === 'reset') {
  await stop(data?.pid)

  if (action === 'reset') {
    // A fresh anonymous identity requires an online keygen lookup. Keep its CLI config.
    const deployment = path.join(state, '.convex/local/default')

    if (fs.existsSync(deployment)) {
      for (const name of fs.readdirSync(deployment)) {
        if (name !== 'config.json') {
          fs.rmSync(path.join(deployment, name), { recursive: true })
        }
      }
    }

    for (const name of ['configured', 'dev.log']) {
      fs.rmSync(path.join(state, name), { force: true })
    }
  }
} else {
  if (action === 'dev' && data !== undefined && running(data.pid)) {
    throw new Error('Local Convex is already running. Stop it with bun run local:stop first.')
  }

  if (data === undefined || !running(data.pid)) {
    assert.ok(action === 'start' || action === 'dev', 'Run local:start first.')

    await stop(data?.pid)
    data = await start()
  }

  if (action === 'seed' || argument === '--seed') {
    run(['run', 'seed:populate'])
  }

  if ((action === 'start' || action === 'dev') && !shutdown.signal.aborted) {
    process.stdout.write(`URL=${data.origin}\n`)
  }

  if (action === 'count') {
    process.stdout.write(`${run(['run', 'seed:count'])}\n`)
  }

  if (action === 'code') {
    const cloudUrl = Schema.decodeSync(Schema.fromJsonString(Schema.String))(
      run(['run', '--inline-query', 'process.env.CONVEX_CLOUD_URL']),
    )

    const reply = run([
      'run',
      'developmentEmail:send',
      json({ origin: data.origin, cloudUrl, email: 'demo@example.test' }),
    ])

    const { code } = Schema.decodeSync(
      Schema.fromJsonString(Schema.Struct({ email: Schema.Struct({ code: Schema.String }) })),
    )(reply).email

    process.stdout.write(`${code}\n`)
  }
}

lock.close()

if (action === 'dev' && data !== undefined) {
  if (!shutdown.signal.aborted) {
    await foregroundExit
  }

  const result = spawnSync(
    process.execPath,
    [import.meta.filename, 'stop-owned', String(data.pid)],
    { stdio: 'inherit' },
  )

  process.exitCode = result.status ?? 1
}
