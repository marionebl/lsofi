import net from 'node:net'

import getPort from 'get-port'

const pid = process.pid

getPort()
  .then(port => {
    const server = net.createServer()
    server.listen(port, () => {
      send({ port, pid, type: 'start' })
    })
  })

function send(message: { pid: number, port: number, type: string }) {
  if (!process.send) {
    return
  }

  process.send(message)
}
