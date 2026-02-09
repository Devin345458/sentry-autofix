<template>
  <v-row>
    <v-col cols="12" sm="6" md="3">
      <v-card>
        <v-card-text>
          <div class="text-overline text-secondary">Total Issues</div>
          <div class="text-h4 font-weight-bold text-primary">{{ stats.total }}</div>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col
      v-for="stat in statusStats"
      :key="stat.status"
      cols="12"
      sm="6"
      md="3"
    >
      <v-card>
        <v-card-text>
          <div class="text-overline text-secondary">{{ stat.label }}</div>
          <div :class="`text-h4 font-weight-bold text-${stat.color}`">{{ stat.count }}</div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
interface Props {
  stats: {
    total: number
    byStatus: { status: string; count: number }[]
  }
}

const props = defineProps<Props>()

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'secondary' },
  in_progress: { label: 'In Progress', color: 'info' },
  pr_open: { label: 'PRs Open', color: 'success' },
}

const statusStats = computed(() => {
  const stats = []
  for (const [status, config] of Object.entries(statusLabels)) {
    const stat = props.stats.byStatus.find((s) => s.status === status)
    stats.push({
      status,
      label: config.label,
      color: config.color,
      count: stat?.count || 0,
    })
  }
  return stats
})
</script>
