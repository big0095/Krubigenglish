import { rawLs, setPrefix, keysOf } from './storage.js'

const PK = 'eem-profiles', AK = 'eem-active', APP = 'english-exam-academy'

export function listProfiles() { try { return JSON.parse(rawLs.getItem(PK) || '[]') } catch { return [] } }
const saveProfiles = l => { try { rawLs.setItem(PK, JSON.stringify(l)) } catch { /* ignore */ } }

export async function hashPin(pin, salt) {
  const s = `${salt}:${pin}`
  try {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
    return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('')
  } catch { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'x' + h }
}

function migrateLegacy(id) {
  try {
    Object.keys(rawLs).filter(k => k.startsWith('eem-') && k !== PK && k !== AK && !k.includes('::'))
      .forEach(k => rawLs.setItem(`${id}::${k}`, rawLs.getItem(k)))
  } catch { /* ignore */ }
}

export async function createProfile(name, pin, migrate = true) {
  const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  const list = listProfiles()
  const first = list.length === 0
  list.push({ id, name: name.trim().slice(0, 18) || 'ผู้เรียน', pin: pin ? await hashPin(pin, id) : null, created: Date.now() })
  saveProfiles(list)
  if (first && migrate) migrateLegacy(id)
  return id
}
export async function verify(id, pin) {
  const p = listProfiles().find(x => x.id === id)
  if (!p) return false
  return !p.pin || (await hashPin(pin, id)) === p.pin
}
export const hasPin = id => !!listProfiles().find(x => x.id === id)?.pin
export const profileName = id => listProfiles().find(x => x.id === id)?.name || 'ผู้เรียน'
export const activeId = () => { try { return rawLs.getItem(AK) } catch { return null } }
export function activate(id) { setPrefix(id); try { rawLs.setItem(AK, id) } catch { /* ignore */ } }
export function logout() { setPrefix(''); try { rawLs.removeItem(AK) } catch { /* ignore */ } }
export function deleteProfile(id) {
  keysOf(id).forEach(k => rawLs.removeItem(k))
  saveProfiles(listProfiles().filter(p => p.id !== id))
}

// ---- สำรอง / กู้คืน ----
export function exportProfile(id) {
  const data = {}
  keysOf(id).forEach(k => { data[k.slice(id.length + 2)] = rawLs.getItem(k) })
  return JSON.stringify({ app: APP, v: 1, name: profileName(id), at: new Date().toISOString(), data })
}
function parse(json) {
  const o = JSON.parse(json)
  if (o.app !== APP || !o.data || typeof o.data !== 'object') throw new Error('bad')
  return o
}
export function importInto(id, json) {
  const o = parse(json)
  keysOf(id).forEach(k => rawLs.removeItem(k))
  Object.entries(o.data).forEach(([k, v]) => { if (k.startsWith('eem-') && typeof v === 'string') rawLs.setItem(`${id}::${k}`, v) })
}
export async function importAsNew(json) {
  const o = parse(json)
  const id = await createProfile(`${o.name || 'ผู้เรียน'} (กู้คืน)`, '', false)
  importInto(id, json)
  return id
}
