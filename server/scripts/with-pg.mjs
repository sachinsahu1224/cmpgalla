import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'

const mode = process.argv[2] === 'test' ? 'test' : 'dev'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = mode === 'test' ? 54330 : 54329
const database = mode === 'test' ? 'galla_test' : 'galla'
const dir = path.join(root, 'data', mode === 'test' ? 'pg-test' : 'pg')

fs.mkdirSync(dir, { recursive: true })
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'galla',
  password: 'galla',
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
})

if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) {
  console.log('Preparing local PostgreSQL. The first run downloads the database engine.')
  await pg.initialise()
}
await pg.start()

const admin = pg.getPgClient('postgres')
await admin.connect()
const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
if (existing.rowCount === 0) await pg.createDatabase(database)
await admin.end()

const env = {
  ...process.env,
  DATABASE_URL: `postgresql://galla:galla@127.0.0.1:${port}/${database}`,
  JWT_SECRET: process.env.JWT_SECRET || 'galla-dev-secret-change-me',
}

try {
  await run('npx', ['prisma', 'generate'])
  await run('npx', ['prisma', 'migrate', 'deploy'])
  await run('npx', ['tsx', 'prisma/seed.ts'])
  const args = mode === 'test' ? ['jest', '--runInBand'] : ['tsx', 'watch', 'src/index.ts']
  process.exitCode = await run('npx', args, true)
} finally {
  await pg.stop()
}

function run(command, args, returnCode = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', shell: true })
    child.on('exit', (status) => {
      const code = status ?? 1
      if (returnCode || code === 0) resolve(code)
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`))
    })
  })
}
