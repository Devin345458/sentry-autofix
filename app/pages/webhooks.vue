<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6">
      <h1 class="text-h4 font-weight-bold">Webhook Events</h1>
      <v-btn
        prepend-icon="mdi-refresh"
        @click="refresh"
      >
        Refresh
      </v-btn>
    </div>

    <WebhooksTable :webhooks="webhooks || []" />
  </div>
</template>

<script setup lang="ts">
const { data: webhooks, refresh } = await useFetch('/api/webhooks')
</script>
