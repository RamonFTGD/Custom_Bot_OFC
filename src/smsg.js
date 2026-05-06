import {
jidDecode,
proto,
extractMessageContent,
getContentType,
downloadContentFromMessage
} from '@whiskeysockets/baileys'

async function streamToBuffer(stream) {
const chunks = []
for await (const chunk of stream) chunks.push(chunk)
return Buffer.concat(chunks)
}

export function smsg(sock, m) {
if (!sock.decodeJid) {
sock.decodeJid = (jid) => {
if (!jid) return jid
if (/:\d+@/gi.test(jid)) {
const {user, server} = jidDecode(jid) ?? {}
return user && server ? `${user}@${server}` : jid
}
return jid
}
}

if (!sock.downloadMediaMessage) {
sock.downloadMediaMessage = async (message) => {
const msg = message.msg || message
const type = (message.type || (msg.mimetype ?? '').split('/')[0]).replace(/Message/gi, '')
return streamToBuffer(await downloadContentFromMessage(msg, type))
}
}

if (!m) return m

m.id = m.key.id
m.chat = m.key.remoteJid
m.isGroup = m.chat.endsWith('@g.us')
m.fromMe = m.key.fromMe
m.sender = sock.decodeJid((m.fromMe && sock.user.id) || m.key.participant || m.chat || '')

if (m.message) {
m.type = getContentType(m.message) || Object.keys(m.message)[0]

const isSpecial = /viewOnceMessage|viewOnceMessageV2Extension|editedMessage|ephemeralMessage/i.test(m.type)
m.msg = isSpecial
? m.message[m.type].message[getContentType(m.message[m.type].message) || '']
: (extractMessageContent(m.message[m.type]) ?? m.message[m.type])

const textGetters = {
conversation: () => m.message.conversation,
imageMessage: () => m.message.imageMessage?.caption,
videoMessage: () => m.message.videoMessage?.caption,
extendedTextMessage: () => m.message.extendedTextMessage?.text,
buttonsResponseMessage: () => m.message.buttonsResponseMessage?.selectedButtonId,
listResponseMessage: () => m.message.listResponseMessage?.singleSelectReply?.selectedRowId,
templateButtonReplyMessage: () => m.message.templateButtonReplyMessage?.selectedId
}

m.text =
(textGetters[m.type]?.() ??
m.msg?.conversation ??
m.msg?.caption ??
m.msg?.text ??
m.msg?.extendedTextMessage?.text ??
'') ||
''

const PREFIX_REGEX = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^/\-]/
if (m.text) {
const match = m.text.match(PREFIX_REGEX)
m.prefix = match?.[0] ?? ''
const parts = m.text.slice(m.prefix.length).trim().split(/ +/)
m.command = parts.shift()?.toLowerCase() ?? ''
m.args = parts
m.body = m.text.slice(m.prefix.length + m.command.length).trim()
} else {
m.prefix = ''
m.command = ''
m.args = []
m.body = ''
}

m.isMedia = !!(m.msg?.mimetype || m.msg?.thumbnailDirectPath)
if (m.isMedia) m.mime = m.msg?.mimetype

m.mentionedJid = m.msg?.contextInfo?.mentionedJid ?? []

m.quoted = m.msg?.contextInfo?.quotedMessage ?? null
if (m.quoted) {
const qMsg = extractMessageContent(m.quoted)
m.quoted.message = qMsg
m.quoted.type = getContentType(qMsg) || (qMsg ? Object.keys(qMsg)[0] : '')
m.quoted.msg = qMsg?.[m.quoted.type] ?? qMsg
m.quoted.isMedia = !!(m.quoted.msg?.mimetype || m.quoted.msg?.thumbnailDirectPath)
m.quoted.id = m.msg.contextInfo.stanzaId
m.quoted.chat = m.chat
m.quoted.sender = sock.decodeJid(m.msg?.contextInfo?.participant ?? '')
m.quoted.fromMe = m.quoted.sender === sock.decodeJid(sock.user.id)
if (m.quoted.isMedia) m.quoted.mime = m.quoted.msg?.mimetype

m.quoted.fakeObj = proto.WebMessageInfo.fromObject({
key: {
remoteJid: m.quoted.chat,
fromMe: m.quoted.fromMe,
id: m.quoted.id
},
message: qMsg,
...(m.isGroup ? {participant: m.quoted.sender} : {})
})

m.quoted.download = () => sock.downloadMediaMessage(m.quoted)
m.quoted.delete = () => sock.sendMessage(m.quoted.chat, {delete: m.quoted.fakeObj.key})
}

m.reply = (text, options = {}) => sock.sendMessage(m.chat, {text, mentions: [m.sender]}, {quoted: m, ...options})

m.react = (emoji) => sock.sendMessage(m.chat, {react: {text: emoji, key: m.key}})

m.download = () => sock.downloadMediaMessage(m)
}

return m
}
