import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { mkdirSync } from 'fs'
import { initDb, seedProjectsFromConfig } from '../utils/db'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const dbPath = resolve(config.dbPath)
  const configPath = resolve(config.configPath)

  console.log('[sentry-autofix] Initializing database:', dbPath)
  initDb(dbPath)

  // Seed projects from config.json if it exists
  if (existsSync(configPath)) {
    try {
      const configData = JSON.parse(readFileSync(configPath, 'utf8'))
      if (configData.projects && Object.keys(configData.projects).length > 0) {
        const seeded = seedProjectsFromConfig(configData.projects)
        if (seeded > 0) {
          console.log(`[sentry-autofix] Seeded ${seeded} project(s) from config.json into database`)
        }
      }
    } catch (err: any) {
      console.error('[sentry-autofix] Failed to load config.json:', err.message)
    }
  }
})
