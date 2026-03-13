import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import path from 'node:path'
import stream from 'node:stream'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import getPort from 'get-port'

import lsofi from './index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const lsofiCjs = require('./index.cjs')
const serial = { concurrency: false }

test('cjs compatibility entry exports a callable function', serial, () => {
  assert.equal(typeof lsofiCjs, 'function')
})

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
  await withSpawnStub(
    [
      'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME',
      'node 1111 user 21u IPv4 0x1 0t0 TCP *:4444 (LISTEN)',
      'node 2222 user 21u IPv4 0x1 0t0 TCP *:4444 (LISTEN)'
    ],
    async () => {
      assert.equal(await lsofi(4444), 1111)
    }
  )
})

test('lsofi resolves null when parser finds no matching pid', serial, async () => {
  await withSpawnStub(
    ['COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME'],
    async () => {
      assert.equal(await lsofi(4444), null)
    }
  )
})

test('lsofi with non-occupied port', serial, async () => {
  const port = await getPort()
  assert.equal(await lsofi(port), null)
})

test('lsofi accepts numeric-string input', serial, async (t) => {
  const s = await server()
  t.after(() => s.stop())
  assert.equal(await lsofi(String(s.port)), s.pid)
})

test('lsofi with occupied port', serial, async (t) => {
  const s = await server()
  t.after(() => s.stop())
  assert.equal(await lsofi(s.port), s.pid)
})

function server () {
  return new Promise((resolve) => {
    const child = childProcess.fork(path.join(__dirname, 'server.js'))

    const stop = function () {
      return new Promise((resolve) => {
        child.kill()
        if (child.killed) {
          return resolve(true)
        }
        child.on('exit', () => {
          resolve(true)
        })
      })
    }

    const onStart = function (data) {
      if (data.type === 'start') {
        data.stop = stop
        resolve(data)
      }
    }

    child.on('message', onStart)
  })
}

async function withSpawnStub (lines, run) {
  const originalSpawn = childProcess.spawn
  childProcess.spawn = function () {
    return spawnFixture(lines)
  }

  try {
    await run()
  } finally {
    childProcess.spawn = originalSpawn
  }
}

function spawnFixture (lines) {
  const child = new EventEmitter()
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

  return child
}
