<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-webhook" class="mr-2" />
      Webhook Events
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="webhooks"
      :items-per-page="50"
      density="comfortable"
    >
      <template #item.decision="{ item }">
        <v-chip
          :color="item.decision === 'accepted' ? 'success' : 'secondary'"
          size="small"
        >
          {{ item.decision }}
        </v-chip>
      </template>

      <template #item.resource="{ item }">
        <span class="monospace text-caption">{{ item.resource }}</span>
      </template>

      <template #item.issue_id="{ item }">
        <span v-if="item.issue_id" class="monospace text-caption">{{ item.issue_id }}</span>
        <span v-else class="text-secondary">—</span>
      </template>

      <template #item.issue_title="{ item }">
        <div v-if="item.issue_title" class="text-truncate" style="max-width: 300px">
          {{ item.issue_title }}
        </div>
        <span v-else class="text-secondary">—</span>
      </template>

      <template #item.reason="{ item }">
        <span v-if="item.reason" class="text-caption">{{ item.reason }}</span>
        <span v-else class="text-secondary">—</span>
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
interface Props {
  webhooks: any[]
}

defineProps<Props>()

const headers = [
  { title: 'Timestamp', key: 'timestamp', sortable: true },
  { title: 'Resource', key: 'resource', sortable: true },
  { title: 'Action', key: 'action', sortable: true },
  { title: 'Issue ID', key: 'issue_id', sortable: true },
  { title: 'Title', key: 'issue_title', sortable: false },
  { title: 'Project', key: 'project_slug', sortable: true },
  { title: 'Decision', key: 'decision', sortable: true },
  { title: 'Reason', key: 'reason', sortable: false },
]
</script>
