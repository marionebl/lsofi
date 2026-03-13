import childProcess from 'node:child_process'
import os from 'node:os'
import readline from 'node:readline'

type Entry = {
  local?: string
  pid?: string
  remote?: string
}

type EntryFilter = (entry: Entry) => false | number

const isWindows = os.platform() === 'win32'

export default function lsofi(port?: number | string): Promise<number | null> {
  if (typeof port === 'undefined') {
    return Promise.reject(new TypeError('missing required input parameter port'))
  }

  if (typeof port === 'string' && port.trim() === '') {
    return Promise.reject(new TypeError('port must be numeric value'))
  }

  const normalizedPort = Number(port)

  if (!Number.isFinite(normalizedPort)) {
    return Promise.reject(new TypeError('port must be numeric value'))
  }

  const command = isWindows
    ? ['netstat.exe', '-a', '-n', '-o']
    : ['lsof', `-i:${normalizedPort}`]

  const columns = isWindows
    ? [null, 'remote', 'local', null, 'pid']
    : [null, 'pid', null, null, null, null, null, null, null]

  const filter = isWindows
    ? windowsFilter(normalizedPort)
    : unixFilter()

  return new Promise((resolve, reject) => {
    let settled = false

    const settle = (value: number | null) => {
      if (settled) {
        return
      }

      settled = true
      resolve(value)
    }

    const child = childProcess.spawn(command[0], command.slice(1))

    child.on('error', error => {
      if (settled) {
        return
      }

      settled = true
      reject(error)
    })

    child.on('close', () => {
      settle(null)
    })

    if (!child.stdout) {
      settled = true
      reject(new Error('spawned process did not provide stdout'))
      return
    }

    const input = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity
    })

    input.on('line', line => {
      const words = parseWords(line)
      if (!words.length) {
        return
      }

      const entry = collate(columns, words)
      const filtered = filter(entry)

      if (!filtered) {
        return
      }

      settle(filtered)
      input.close()
      child.kill()
    })
  })
}

function parseWords(line: string): string[] {
  return line.split(' ')
    .map(i => i.trim())
    .filter(Boolean)
    .filter(i => i !== '(LISTEN)')
}

function collate(columns: Array<string | null>, words: string[]): Entry {
  return columns.reduce<Entry>((entry, column, index) => {
    if (column === null) {
      return entry
    }

    if (!words[index]) {
      return entry
    }

    if (words[index].toLowerCase() === column.toLowerCase()) {
      return entry
    }

    return {
      ...entry,
      [column]: words[index]
    }
  }, {})
}

function windowsFilter(port: number): EntryFilter {
  return i => {
    const ports = [i.remote, i.local]
      .filter((i): i is string => Boolean(i))
      .filter(address => address !== '*:*')
      .map(address => {
        const fragments = address.split(':')
        return Number(fragments[fragments.length - 1])
      })
      .filter(port => Number.isFinite(port))

    if (!ports.length) {
      return false
    }

    if (ports.indexOf(port) === -1) {
      return false
    }

    const pid = Number(i.pid)

    if (!Number.isFinite(pid)) {
      return false
    }

    return pid
  }
}

function unixFilter(): EntryFilter {
  return i => {
    if (typeof i !== 'object') {
      return false
    }

    if (Object.keys(i).length === 0) {
      return false
    }

    const pid = Number(i.pid)

    if (!Number.isFinite(pid)) {
      return false
    }

    return pid
  }
}
