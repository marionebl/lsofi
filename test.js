const childProcess = require('child_process')
const test = require('ava')
const getPort = require('get-port')

const lsofi = require('./index.js')

test('lsofi without input', async t => {
  t.throws(lsofi(), /required input/, 'fails with input error')
})

test('lsofi without non-numeric input', async t => {
  t.throws(lsofi('null'), /must be numeric/, 'fails with type error')
})

test('lsofi with non-occupied port', async t => {
  const port = await getPort()
  t.is(await lsofi(port), null, 'should return null')
})

test('lsofi with occupied port', async t => {
  const s = await server()
  t.is(await lsofi(s.port), s.pid, 'shoult return the correct pid')
})

function server () {
  return new Promise((resolve, reject) => {
    const child = childProcess.fork(`${__dirname}/server.js`)

    const onStop = function () {
      return new Promise((resolve, reject) => {
        if (child.killed) {
          return resolve(true)
        }
        child.on('exit', message => {
          resolve(true)
        })
      })
    }

    const onStart = function (data) {
      if (data.type === 'start') {
        data.killed = onStop
        resolve(data)
      }
    }

    child.on('message', onStart)
  })
}
