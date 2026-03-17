import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import stream from 'node:stream'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import getPort from 'get-port'

import lsofi from './index.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const serial = { concurrency: false }
const isWindows = os.platform() === 'win32'

test('lsofi without input', serial, async () => {
  await assert.rejects(lsofi(), { message: /required input/ })
})

test('lsofi without non-numeric input', serial, async () => {
  await assert.rejects(lsofi('null'), { message: /must be numeric/ })
})

test('lsofi rejects empty-string input', serial, async () => {
  await assert.rejects(lsofi(''), { message: /must be numeric/ })
})

test('lsofi rejects NaN input', serial, async () => {
  await assert.rejects(lsofi(Number.NaN), { message: /must be numeric/ })
})

test('lsofi rejects Infinity input', serial, async () => {
  await assert.rejects(lsofi(Number.POSITIVE_INFINITY), { message: /must be numeric/ })
})

test('lsofi resolves first matching pid from parser output', serial, async () => {
  const lines = isWindows
    ? [
        'Proto Local Address Foreign Address State PID',
        'TCP 0.0.0.0:4444 0.0.0.0:0 LISTENING 1111',
        'TCP 0.0.0.0:4444 0.0.0.0:0 LISTENING 2222'
      ]
    : [
        'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME',
        'node 1111 user 21u IPv4 0x1 0t0 TCP *:4444 (LISTEN)',
        'node 2222 user 21u IPv4 0x1 0t0 TCP *:4444 (LISTEN)'
      ]

  await withSpawnStub(lines, async () => {
    assert.equal(await lsofi(4444), 1111)
  })
})

test('lsofi resolves null when parser finds no matching pid', serial, async () => {
  const lines = isWindows
    ? ['Proto Local Address Foreign Address State PID']
    : ['COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME']

  await withSpawnStub(lines, async () => {
    assert.equal(await lsofi(4444), null)
  })
})

test('lsofi with non-occupied port', serial, async () => {
  const port = await getPort()
  assert.equal(await lsofi(port), null)
})

test('lsofi accepts numeric-string input', serial, async t => {
  const s = await server()
  t.after(() => s.stop())
  assert.equal(await lsofi(String(s.port)), s.pid)
})

test('lsofi with occupied port', serial, async t => {
  const s = await server()
  t.after(() => s.stop())
  assert.equal(await lsofi(s.port), s.pid)
})

function server(): Promise<{ pid: number, port: number, stop: () => Promise<boolean>, type: string }> {
  return new Promise(resolve => {
    const child = childProcess.fork(path.join(__dirname, 'server.ts'))

    const stop = () => new Promise<boolean>(resolveStop => {
      child.kill()
      if (child.killed) {
        return resolveStop(true)
      }

      child.on('exit', () => {
        resolveStop(true)
      })
    })

    const onStart = (data: { pid: number, port: number, type: string }) => {
      if (data.type === 'start') {
        resolve({ ...data, stop })
      }
    }

    child.on('message', onStart)
  })
}

async function withSpawnStub(lines: string[], run: () => Promise<void>): Promise<void> {
  const mutableChildProcess = childProcess as typeof childProcess & {
    spawn: typeof childProcess.spawn
  }
  const originalSpawn = childProcess.spawn
  mutableChildProcess.spawn = (() => {
    return spawnFixture(lines)
  }) as typeof childProcess.spawn

  try {
    await run()
  } finally {
    mutableChildProcess.spawn = originalSpawn
  }
}

function spawnFixture(lines: string[]): ReturnType<typeof childProcess.spawn> {
  const child = new EventEmitter() as unknown as EventEmitter & {
    kill: () => void
    killed: boolean
    stdout: stream.PassThrough
  }

  child.stdout = new stream.PassThrough()
  child.killed = false

  child.kill = function () {
    child.killed = true
    process.nextTick(() => child.emit('close'))
  }

  process.nextTick(() => {
    lines.forEach(line => {
      child.stdout.write(`${line}\n`)
    })
    child.stdout.end()
    if (!child.killed) {
      child.emit('close')
    }
  })

  return child as unknown as ReturnType<typeof childProcess.spawn>
}
