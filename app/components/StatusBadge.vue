<template>
  <v-chip
    :color="statusColor"
    :prepend-icon="statusIcon"
    size="small"
    variant="flat"
  >
    {{ statusLabel }}
  </v-chip>
</template>

<script setup lang="ts">
interface Props {
  status: string
}

const props = defineProps<Props>()

const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
  pending: { color: 'secondary', icon: 'mdi-clock-outline', label: 'Pending' },
  in_progress: { color: 'info', icon: 'mdi-loading mdi-spin', label: 'In Progress' },
  pr_open: { color: 'success', icon: 'mdi-source-pull', label: 'PR Open' },
  fixed: { color: 'success', icon: 'mdi-check-circle', label: 'Fixed' },
  failed: { color: 'warning', icon: 'mdi-alert', label: 'Failed' },
  error: { color: 'error', icon: 'mdi-close-circle', label: 'Error' },
}

const statusColor = computed(() => statusConfig[props.status]?.color || 'secondary')
const statusIcon = computed(() => statusConfig[props.status]?.icon || 'mdi-help-circle')
const statusLabel = computed(() => statusConfig[props.status]?.label || props.status)
</script>
