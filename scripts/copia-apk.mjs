// Porta l'APK appena compilato accanto al progetto, con un nome che si legge.
// La compilazione avviene fuori da OneDrive: senza questo passaggio andresti a
// cercarlo in una cartella nascosta.
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const build = join(process.env.LOCALAPPDATA ?? '', 'etp-health-build', '_app', 'outputs', 'apk', 'debug', 'app-debug.apk')
const dest = new URL('../ETP-HEALTH.apk', import.meta.url)
if (!existsSync(build)) throw new Error(`APK non trovato in ${build}`)
copyFileSync(build, dest)
console.log('ETP-HEALTH.apk aggiornato nella cartella del progetto.')
