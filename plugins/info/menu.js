import { cmdIndex } from '../../src/loader.js'
import config from '../../config.js'

export default {
command: ['menu', 'help', 'h'],

async run(sock, m) {
const seen = new Set()
const cats = {}

for (const [alias, plugin] of cmdIndex) {
const mainAlias = plugin.command[0]
if (seen.has(mainAlias)) continue
seen.add(mainAlias)

const cat = plugin.category || 'general'
if (!cats[cat]) cats[cat] = []
cats[cat].push({alias: mainAlias, desc: plugin.desc || ''})
}

const prefix = config.prefix[0]
let txt = `┌─── *${config.botName}* ───┐\n\n`

for (const [cat, cmds] of Object.entries(cats)) {
txt += `*${cat.toUpperCase()}* 🐧\n`
for (const {alias, desc} of cmds) {
txt += `  ${prefix}${alias}${desc ? ` — ${desc}` : ''}\n`
}
txt += '\n'
}

txt += `└─── ${cmdIndex.size} comandos ───┘`
await m.reply(txt)
}
}
