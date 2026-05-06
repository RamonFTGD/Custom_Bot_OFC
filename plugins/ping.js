export default {
command: ['ping', 'p'],
desc: 'test',
category: 'test',

async run(sock, m) {
const start = Date.now()
await m.reply('Calculando...')
const ms = Date.now() - start
await m.reply(`*Pong!* — ${ms}ms`)
}
}
