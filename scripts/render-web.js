import { spawnSync } from 'node:child_process'

if (!process.env.RENDER) process.exit(0)

function run(args) {
  const result = spawnSync('npm', args, { stdio: 'inherit', shell: true })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(['install', '--include=dev', '--prefix', 'web'])
run(['run', 'build', '--prefix', 'web'])
