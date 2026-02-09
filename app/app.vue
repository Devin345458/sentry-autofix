<template>
  <v-app>
    <AppHeader />

    <v-main>
      <v-container fluid class="pa-6">
        <NuxtPage />
      </v-container>
    </v-main>

    <AppToast />
  </v-app>
</template>

<script setup lang="ts">
useHead({
  title: 'Sentry AutoFix',
  meta: [
    { name: 'description', content: 'Automatically fix Sentry bugs with Claude Code' },
  ],
})
</script>
