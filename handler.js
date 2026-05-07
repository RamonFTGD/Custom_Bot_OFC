import log from './src/logger.js'
import config from './config.js'
import { checkCooldown, cmdIndex, isReady, onMsgHooks } from './src/loader.js'

const ownerSet = new Set(config.owners.map((n) => n.replace(/\D/g, '') + '@s.whatsapp.net'))

const jidCache = new Map()
const jidCacheTimers = new Map()
const groupMetaCache = new Map()

const JID_TTL = 30 * 60_000
const META_TTL = 5 * 60_000

function setJidCache(key, value) {
    if (jidCacheTimers.has(key)) clearTimeout(jidCacheTimers.get(key))
    jidCache.set(key, value)
    jidCacheTimers.set(
        key,
        setTimeout(() => {
            jidCache.delete(key)
            jidCacheTimers.delete(key)
        }, JID_TTL)
    )
}

function phoneToJid(phone) {
    if (!phone) return null
    const base = typeof phone === 'number' ? String(phone) : phone.replace(/\D/g, '')
    return base ? `${base}@s.whatsapp.net` : null
}

async function resolveLidInGroup(input, sock, chat) {
    if (jidCache.has(input)) return jidCache.get(input)

    const hit = groupMetaCache.get(chat)
    let meta = hit && Date.now() - hit.timestamp < META_TTL ? hit.metadata : null

    if (!meta) {
        try {
            meta = await sock.groupMetadata(chat)
            groupMetaCache.set(chat, { metadata: meta, timestamp: Date.now() })
        } catch {
            return input
        }
    }

    const participants = meta?.participants || []

    const byId = participants.find(
        (p) => p.id === input || p.id.split(':')[0] === input.split(':')[0] || p.id.split('@')[0] === input.split('@')[0]
    )
    if (byId?.jid) {
        const realJid = phoneToJid(byId.phoneNumber)
        if (realJid) {
            setJidCache(input, realJid)
            return realJid
        }
    }

    const byLid = participants.find((p) => p.lid === input || p.id === input)
    if (byLid?.jid) {
        const realJid = phoneToJid(byLid.jid)
        if (realJid) {
            setJidCache(input, realJid)
            return realJid
        }
    }

    return input
}

async function resolveLid(m, sock) {
    const decoded = sock.decodeJid(m.key?.participant || m.chat || '')
    const input = decoded?.toString().trim()
    if (!input) return input

    if (input.endsWith('@s.whatsapp.net')) return input

    if (m.chat?.endsWith('@g.us')) {
        return resolveLidInGroup(input, sock, m.chat)
    }

    if (input.includes('@lid')) {
        if (jidCache.has(input)) return jidCache.get(input)
        try {
            const result = await sock.onWhatsApp(input)
            if (result?.length > 0) {
                const realJid = result[0].jid
                setJidCache(input, realJid)
                return realJid
            }
        } catch {
            return input
        }
    }

    return input
}

const groupCache = new Map()
const GROUP_TTL = 15 * 60_000

async function getGroupInfo(sock, chat) {
    const hit = groupCache.get(chat)
    if (hit && Date.now() - hit.ts < GROUP_TTL) return hit

    const meta = await sock.groupMetadata(chat).catch(() => null)
    if (!meta) return null

    const admins = new Set()
    for (const p of meta.participants) {
        if (p.admin === 'admin' || p.admin === 'superadmin') {
            admins.add(p.id.split('@')[0].split(':')[0])
        }
    }

    const entry = { meta, admins, ts: Date.now() }
    groupCache.set(chat, entry)
    return entry
}

export default async function handler(sock, m) {
    try {
        if (!isReady() || !m.message) return
        if (m.chat === 'status@broadcast') return

        for (const plugin of onMsgHooks) {
            try {
                const stop = await plugin.onMessage(sock, m)
                if (stop === true) return
            } catch (e) {
                log.error(`onMessage [${plugin.command?.[0]}] → ${e?.message || e}`)
            }
        }

        const prefix = config.prefix.find((p) => m.text?.startsWith(p))
        if (!prefix) return

        const body = m.text.slice(prefix.length).trim()
        const parts = body.split(/ +/)
        const cmdName = parts.shift()?.toLowerCase() ?? ''
        const text = parts.join(' ')
        const args = text.split(/ +/).filter(Boolean)

        if (!cmdName) return

        const cmd = cmdIndex.get(cmdName)
        if (!cmd) return

        const senderJid = await resolveLid(m, sock)

        const isOwner = ownerSet.has(senderJid)
        let isAdmin = false
        let isBotAdmin = false
        let groupMeta = null

        if (m.isGroup) {
            const info = await getGroupInfo(sock, m.chat)
            if (info) {
                groupMeta = info.meta
                const sNum = senderJid.split('@')[0].split(':')[0]
                const bNum = sock.user?.id?.split(':')[0].split('@')[0] ?? ''
                isAdmin = info.admins.has(sNum)
                isBotAdmin = info.admins.has(bNum)
            }
        }

        if (cmd.isOwner && !isOwner) return m.reply('🚩 Solo para el dueño del bot')
        if (cmd.isGroup && !m.isGroup) return m.reply('🚩 Solo disponible en grupos')
        if (cmd.isAdmin && !isAdmin) return m.reply('🚩 Solo administradores del grupo')
        if (cmd.isBotAdmin && !isBotAdmin) return m.reply('🚩 El bot debe ser administrador')

        const wait = checkCooldown(cmd, senderJid)
        if (wait > 0) return m.reply(` Espera ${wait}s antes de usar este comando de nuevo`)

        log.cmd(cmdName, senderJid.split('@')[0], m.isGroup ? `grupo · ${groupMeta?.subject || m.chat}` : 'privado')

        try {
            await cmd.run(sock, m, {
                args,
                text,
                prefix,
                cmd: cmdName,
                isOwner,
                isAdmin,
                isBotAdmin,
                groupMeta,
                senderJid
            })
        } catch (e) {
            log.error(`cmd '${cmdName}' → ${e?.message || e}`)
            if (typeof e === 'string') return m.reply(e)
            if (e instanceof Error) return m.reply(`⚠️ ${e.message}`)
            return m.reply('⚠️ Ocurrió un error al ejecutar el comando.')
        }
    } catch (e) {
        log.error(`handler global → ${e?.message || e}`)
    }
}
