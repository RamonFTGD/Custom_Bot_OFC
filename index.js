import readline from 'readline'
import pino from 'pino'

import {
default as makeWASocket,
useMultiFileAuthState,
fetchLatestBaileysVersion,
makeCacheableSignalKeyStore,
DisconnectReason,
Browsers,
jidDecode
} from '@whiskeysockets/baileys'

import log from './src/logger.js'
import config from './config.js'
import { smsg } from './src/smsg.js'
import handler from './handler.js'
import { loadPlugins, watchPlugins } from './src/loader.js'

const AUTH_DIR = config.authDir
const MAX_RETRIES = 5

let retries = 0
let botReady = false
let isRestarting = false

function ask(prompt) {
return new Promise((resolve) => {
const rl = readline.createInterface({
input: process.stdin,
output: process.stdout
})
rl.question(prompt, (ans) => {
rl.close()
resolve(ans.trim())
})
rl.on('SIGINT', () => {
rl.close()
resolve('')
})
})
}

async function requestPairing(sock) {
let done = false

sock.ev.on('connection.update', async ({qr}) => {
if (!qr || done) return
done = true

log.info('Ingresa tu número (con código de país, sin +):')
let phone = await ask('  › ')
phone = phone.replace(/\D/g, '')

if (!phone || phone.length < 7) {
log.error('Número inválido')
done = false
return
}

try {
const code = await sock.requestPairingCode(phone)
const fmt = code.match(/.{1,4}/g)?.join(' - ') || code
log.ok(`Código de vinculación: ${fmt}`)
log.info('WhatsApp → Dispositivos vinculados → Vincular con número de teléfono')
} catch (e) {
log.error(`Error al generar código → ${e?.message || e}`)
done = false
}
})
}

async function startBot() {
if (isRestarting) return
isRestarting = true

const {state, saveCreds} = await useMultiFileAuthState(AUTH_DIR)
const {version} = await fetchLatestBaileysVersion()
const hasSession = !!state.creds?.registered

const sock = makeWASocket({
version,
logger: pino({level: 'silent'}),
printQRInTerminal: false,
auth: {
creds: state.creds,
keys: makeCacheableSignalKeyStore(state.keys, pino({level: 'silent'}))
},
browser: Browsers.appropriate('Safari'),
generateHighQualityLinkPreview: false,
shouldIgnoreJid: (jid) => jid.endsWith('@broadcast'),
syncFullHistory: false,
markOnlineOnConnect: false,
keepAliveIntervalMs: 25_000
})

sock.decodeJid = (jid) => {
if (!jid) return jid
if (/:\d+@/gi.test(jid)) {
const {user, server} = jidDecode(jid) ?? {}
return user && server ? `${user}@${server}` : jid
}
return jid
}

sock.ev.on('creds.update', saveCreds)

if (!hasSession) await requestPairing(sock)

sock.ev.on('messages.upsert', async ({messages, type}) => {
if (!botReady || type !== 'notify') return
try {
const raw = messages[0]
if (!raw?.message) return
const m = smsg(sock, raw)
handler(sock, m).catch((e) => log.error(`messages.upsert → ${e?.message || e}`))
} catch (e) {
log.error(`messages.upsert → ${e?.message || e}`)
}
})

sock.ev.on('connection.update', async ({connection, lastDisconnect}) => {
if (connection === 'open') {
retries = 0
isRestarting = false

log.ok(`Bot conectado — ${config.botName}`)

if (!botReady) {
log.info('Cargando plugins...')
await loadPlugins()
watchPlugins()

botReady = true
log.ok('Bot listo ✔')
}
}

if (connection === 'close') {
const code = lastDisconnect?.error?.output?.statusCode
const loggedOut = code === DisconnectReason.loggedOut || code === 401

if (loggedOut) {
log.warn('Sesión cerrada — eliminando auth y reiniciando...')
try {
const {rmSync} = await import('fs')
rmSync(AUTH_DIR, {recursive: true, force: true})
} catch {}
botReady = false
isRestarting = false
setTimeout(startBot, 3000)
return
}

retries++
if (retries >= MAX_RETRIES) {
log.error(`${MAX_RETRIES} intentos fallidos — limpiando sesión...`)
retries = 0
botReady = false
isRestarting = false
try {
const {rmSync} = await import('fs')
rmSync(AUTH_DIR, {recursive: true, force: true})
} catch {}
setTimeout(startBot, 3000)
return
}

const delay = Math.min(5000 * retries, 30_000)
log.warn(`Reintentando en ${delay / 1000}s... (${retries}/${MAX_RETRIES})`)
isRestarting = false
setTimeout(startBot, delay)
}
})
}

log.info(`Iniciando ${config.botName}...`)

startBot()
