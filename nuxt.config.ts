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
    sentryWebhookSecret: '',
    sentryAuthToken: '',
    sentryOrgSlug: '',
    sentryBaseUrl: 'https://sentry.io/api/0',
    dbPath: './data/sentry-autofix.db',
    configPath: './config.json',
    reposDir: '/tmp/sentry-autofix-repos',
    claudeModel: 'sonnet-4-5',
    claudeCodePath: 'claude',
    maxConcurrentFixes: 1,
    maxAttemptsPerIssue: 2,
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
