<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-bug" class="mr-2" />
      Recent Issues
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="issues"
      :items-per-page="25"
      density="comfortable"
    >
      <template #item.title="{ item }">
        <div class="text-truncate" style="max-width: 400px">
          {{ item.title }}
        </div>
      </template>

      <template #item.status="{ item }">
        <StatusBadge :status="item.status" />
      </template>

      <template #item.level="{ item }">
        <v-chip :color="levelColor(item.level)" size="small">
          {{ item.level }}
        </v-chip>
      </template>

      <template #item.attempts="{ item }">
        <span class="monospace">{{ item.attempts }}</span>
      </template>

      <template #item.actions="{ item }">
        <v-btn
          v-if="item.pr_url"
          :href="item.pr_url"
          target="_blank"
          icon="mdi-open-in-new"
          size="small"
          variant="text"
        />
        <v-btn
          icon="mdi-text-box-outline"
          size="small"
          variant="text"
          @click="$emit('viewLogs', item.sentry_issue_id)"
        />
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
interface Props {
  issues: any[]
}

defineProps<Props>()
defineEmits(['viewLogs'])

const headers = [
  { title: 'Issue ID', key: 'sentry_issue_id', sortable: true },
  { title: 'Title', key: 'title', sortable: false },
  { title: 'Project', key: 'sentry_project', sortable: true },
  { title: 'Level', key: 'level', sortable: true },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Attempts', key: 'attempts', sortable: true },
  { title: 'Updated', key: 'updated_at', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, align: 'end' },
]

const levelColor = (level: string) => {
  const colors: Record<string, string> = {
    error: 'error',
    warning: 'warning',
    info: 'info',
    fatal: 'error',
  }
  return colors[level] || 'secondary'
}
</script>
