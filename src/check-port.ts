import lsofi from './index.ts'

const [, , rawPort] = process.argv

if (typeof rawPort === 'undefined') {
  console.error('Usage: npm run check-port -- <port>')
  process.exit(1)
}

const pid = await lsofi(rawPort)

console.log(pid)
