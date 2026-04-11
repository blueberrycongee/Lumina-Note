/**
 * Key-value secure store — replaces @tauri-apps/plugin-store
 * Uses a simple JSON file in userData for persistence.
 * For API keys / tokens, this is sufficient for a local-first app.
 */

import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let storeData: Record<string, unknown> = {}
let storePath = ''
let loaded = false

function getStorePath(): string {
  if (!storePath) storePath = path.join(app.getPath('userData'), 'lumina-store.json')
  return storePath
}

function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8')
    storeData = JSON.parse(raw)
  } catch {
    storeData = {}
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(getStorePath()), { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify(storeData, null, 2), 'utf-8')
  } catch {}
}

export const storeHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  // Custom invoke commands used by src/lib/secureStore.ts
  async secure_store_get({ key }) {
    load()
    return storeData[key as string] ?? null
  },

  async secure_store_set({ key, value }) {
    load()
    storeData[key as string] = value
    save()
  },

  async secure_store_delete({ key }) {
    load()
    delete storeData[key as string]
    save()
  },

  // @tauri-apps/plugin-store plugin commands (used by some features)
  async 'plugin:store|get'({ store: _s, key }) {
    load()
    return storeData[key as string] ?? null
  },

  async 'plugin:store|set'({ store: _s, key, value }) {
    load()
    storeData[key as string] = value
    save()
  },

  async 'plugin:store|delete'({ store: _s, key }) {
    load()
    delete storeData[key as string]
    save()
  },

  async 'plugin:store|clear'() {
    storeData = {}
    save()
  },

  async 'plugin:store|values'() {
    load()
    return Object.values(storeData)
  },

  async 'plugin:store|entries'() {
    load()
    return Object.entries(storeData)
  },

  async 'plugin:store|keys'() {
    load()
    return Object.keys(storeData)
  },

  async 'plugin:store|length'() {
    load()
    return Object.keys(storeData).length
  },

  async 'plugin:store|save'() {
    save()
  },

  async 'plugin:store|load'() {
    loaded = false
    load()
  },
}
