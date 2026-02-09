<template>
  <v-app-bar color="surface" elevation="0" border="b">
    <v-app-bar-title class="d-flex align-center gap-2">
      <v-icon icon="mdi-auto-fix" color="primary" size="28" />
      <span class="text-h6 font-weight-bold">Sentry AutoFix</span>
    </v-app-bar-title>

    <template #append>
      <v-btn
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        variant="text"
        :prepend-icon="link.icon"
      >
        {{ link.label }}
      </v-btn>
    </template>
  </v-app-bar>
</template>

<script setup lang="ts">
const links = [
  { to: '/', label: 'Dashboard', icon: 'mdi-view-dashboard' },
  { to: '/webhooks', label: 'Webhooks', icon: 'mdi-webhook' },
]
</script>
