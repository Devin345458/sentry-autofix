import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { initDb, seedProjectsFromConfig } from '../utils/db'

export default defineNitroPlugin(() => {
  const { dbPath, configPath } = useRuntimeConfig()
  const resolvedDbPath = resolve(dbPath)
  const resolvedConfigPath = resolve(configPath)

  console.log('[sentry-autofix] Initializing database:', resolvedDbPath)
  initDb(resolvedDbPath)

  // Seed projects from config.json if it exists
  if (existsSync(resolvedConfigPath)) {
    try {
      const configData = JSON.parse(readFileSync(resolvedConfigPath, 'utf8'))
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
