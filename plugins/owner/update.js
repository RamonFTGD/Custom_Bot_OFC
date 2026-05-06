import { exec } from 'child_process'
import { promisify } from 'util'
import { loadPlugins } from '../../src/loader.js'

const execute = promisify(exec)

export default {
command: ['update', 'actualizar', 'f'],
isOwner: true,

async run(sock, m) {
try {
const {stdout} = await execute('git pull')

if (stdout.includes('Already up to date')) {
return await m.reply('🍜 El sistema ya esta actualizado.')
}

await loadPlugins()

await m.reply(`\`\`\`${stdout}\`\`\``)
} catch (e) {
await m.reply('🚩 Error durante la actualizacion:\n' + e.message)
}
}
}
