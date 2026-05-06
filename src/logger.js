const C = {
reset: '\x1b[0m',
bold: '\x1b[1m',
dim: '\x1b[2m',

black: '\x1b[30m',
red: '\x1b[31m',
green: '\x1b[32m',
yellow: '\x1b[33m',
blue: '\x1b[34m',
magenta: '\x1b[35m',
cyan: '\x1b[36m',
white: '\x1b[37m',

bgRed: '\x1b[41m',
bgGreen: '\x1b[42m',
bgYellow: '\x1b[43m',
bgBlue: '\x1b[44m',
bgMagenta: '\x1b[45m',
bgCyan: '\x1b[46m'
}

function time() {
return new Date().toLocaleTimeString('es-MX', {hour12: false})
}

const log = {
info: (msg) => console.log(`${C.bgBlue}${C.white}${C.bold} INFO ${C.reset} ${C.cyan}${msg}${C.reset}`),
ok: (msg) => console.log(`${C.bgGreen}${C.white}${C.bold} OK ${C.reset} ${C.green}${msg}${C.reset}`),
warn: (msg) => console.log(`${C.bgYellow}${C.red}${C.bold} WARN ${C.reset} ${C.yellow}${msg}${C.reset}`),
error: (msg) => console.log(`${C.bgRed}${C.white}${C.bold} ERROR ${C.reset} ${C.red}${msg}${C.reset}`),
reload: (msg) => console.log(`${C.yellow}${C.bold}( RELOAD )${C.reset} ${C.white}${msg}${C.reset}`),
plugin: (msg) => console.log(`${C.green}${C.bold}( PLUGIN )${C.reset} ${C.green}${msg}${C.reset}`),
watch: (msg) => console.log(`${C.blue}${C.bold}( WATCH  )${C.reset} ${C.white}${msg}${C.reset}`),
event: (msg) => console.log(`${C.cyan}${C.bold}( EVENT  )${C.reset} ${C.cyan}${msg}${C.reset}`),
cmd: (name, sender, scope) => {
console.log()
console.log(
`${C.magenta}${C.bold} CMD  ${C.reset}${C.dim}│${C.reset} ${C.white}${C.bold}${name}${C.reset}  ${C.dim}·${C.reset}  ${C.cyan}${scope}${C.reset}`
)
console.log(`${C.magenta}${C.bold} USER ${C.reset}${C.dim}│${C.reset} ${C.white}${sender}${C.reset}`)
console.log(`${C.magenta}${C.bold} TIME ${C.reset}${C.dim}│${C.reset} ${C.dim}${time()}${C.reset}`)
console.log()
}
}

export default log
