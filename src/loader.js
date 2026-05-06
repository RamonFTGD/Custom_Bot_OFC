import { watch } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join, resolve } from 'path'
import log from './logger.js'
import config from '../config.js'

export const plugins = new Map()
export const cmdIndex = new Map()
export const onMsgHooks = []
const cooldowns = new Map()

let _ready = false
export const isReady = () => _ready

async function getFiles(dir) {
const out = []
try {
const entries = await readdir(dir)
await Promise.all(
entries.map(async (f) => {
const fp = join(dir, f)
const s = await stat(fp)
if (s.isDirectory()) out.push(...(await getFiles(fp)))
else if (f.endsWith('.js')) out.push(fp)
})
)
} catch {}
return out
}

async function loadOne(fp) {
try {
const mod = await import(`${resolve(fp)}?t=${Date.now()}`)
const p = mod.default

if (!p || !Array.isArray(p.command) || !p.command.length) return

const old = plugins.get(fp)
if (old) for (const alias of old.command) cmdIndex.delete(alias)

plugins.set(fp, p)
for (const alias of p.command) cmdIndex.set(alias.toLowerCase(), p)
return p
} catch (e) {
const name = fp.split('/').pop()
log.error(`Plugin '${name}' → ${e?.message || e}`)
return null
}
}

function unloadOne(fp) {
const p = plugins.get(fp)
if (!p) return
for (const alias of p.command) cmdIndex.delete(alias)
plugins.delete(fp)
}

function rebuildHooks() {
onMsgHooks.length = 0
for (const p of plugins.values()) {
if (typeof p.onMessage === 'function') onMsgHooks.push(p)
}
}

export async function loadPlugins() {
const dir = resolve(config.pluginsDir)
const files = await getFiles(dir)

plugins.clear()
cmdIndex.clear()

let ok = 0,
fail = 0
await Promise.all(
files.map(async (fp) => {
const p = await loadOne(fp)
if (p) ok++
else fail++
})
)

rebuildHooks()
_ready = true

log.plugin(`${ok} plugin(s) cargado(s)` + (fail ? ` · ${fail} con errores` : ' · sin errores'))
}

export function watchPlugins() {
const dir = resolve(config.pluginsDir)
let timer = null

watch(dir, {recursive: true}, async (event, filename) => {
if (!filename?.endsWith('.js')) return
if (timer) clearTimeout(timer)

timer = setTimeout(async () => {
const fp = join(dir, filename)

try {
await stat(fp)
} catch {
unloadOne(fp)
rebuildHooks()
log.reload(`Eliminado → ${filename}`)
return
}

log.reload(`Cambio detectado → ${filename}`)
const p = await loadOne(fp)
if (p) {
rebuildHooks()
log.plugin(`Recargado → ${p.command.join(', ')}`)
}
}, 400)
})

log.watch(`Observando → ${dir}`)
}

export function checkCooldown(cmd, sender) {
if (!cmd.cooldown || cmd.cooldown <= 0) return 0
const key = `${cmd.command[0]}:${sender}`
const last = cooldowns.get(key) || 0
const diff = (Date.now() - last) / 1000
if (diff < cmd.cooldown) return Math.ceil(cmd.cooldown - diff)
cooldowns.set(key, Date.now())
return 0
}
