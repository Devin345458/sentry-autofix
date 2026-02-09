// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  srcDir: 'app/',
  serverDir: 'server/',

  modules: [
    'vuetify-nuxt-module',
    '@nuxt/fonts'
  ],

  vuetify: {
    moduleOptions: {
      /* module specific options */
    },
    vuetifyOptions: {
      theme: {
        defaultTheme: 'sentryDark',
        themes: {
          sentryDark: {
            dark: true,
            colors: {
              background: '#06080d',
              surface: '#131922',
              'surface-bright': '#1a2332',
              'surface-variant': '#1f2937',
              'on-surface-variant': '#9ca3af',
              primary: '#d4943a',
              'primary-darken-1': '#b87f2f',
              secondary: '#6b7280',
              'secondary-darken-1': '#4b5563',
              error: '#ef4444',
              info: '#3b82f6',
              success: '#22c55e',
              warning: '#f59e0b',
            },
          },
        },
      },
    },
  },

  css: ['~/assets/styles/main.scss'],

  runtimeConfig: {
    // Server-only (private)
    claudeCodePath: process.env.CLAUDE_CODE_PATH || '',
    claudeModel: process.env.CLAUDE_MODEL || 'sonnet-4-5',
    sentryAuthToken: process.env.SENTRY_AUTH_TOKEN || '',
    sentryWebhookSecret: process.env.SENTRY_WEBHOOK_SECRET || '',
    githubToken: process.env.GITHUB_TOKEN || '',
    dbPath: process.env.DB_PATH || './sentry-autofix.db',
    configPath: process.env.CONFIG_PATH || './config.json',
    logLevel: process.env.LOG_LEVEL || 'info',

    // Public (available on client)
    public: {
      appName: 'Sentry AutoFix'
    }
  },

  nitro: {
    experimental: {
      websocket: false
    },
    externals: {
      external: ['better-sqlite3']
    }
  },

  typescript: {
    strict: true,
    typeCheck: false // Set to true for stricter checking in dev
  }
})
