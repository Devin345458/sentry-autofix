<template>
  <v-dialog v-model="show" max-width="900" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span class="text-h6">Issue Logs: {{ issueId }}</span>
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="show = false"
        />
      </v-card-title>

      <v-divider />

      <v-card-text style="max-height: 600px" class="pa-0">
        <div v-if="logs.length === 0" class="pa-4 text-center text-secondary">
          No logs yet...
        </div>
        <div v-else>
          <div
            v-for="(log, i) in logs"
            :key="i"
            :class="`log-line source-${log.source}`"
          >
            <span class="text-secondary text-caption mr-2">
              [{{ formatTime(log.timestamp) }}]
            </span>
            <span class="text-info text-caption mr-2">
              {{ log.source }}:
            </span>
            <span>{{ log.message }}</span>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
interface Props {
  modelValue: boolean
  issueId: string | null
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const show = computed({
  get: () => props.modelValue,
  set: (val) => {
    emit('update:modelValue', val)
    if (!val) {
      disconnect()
    }
  },
})

const { logs, connect, disconnect } = useLogSSE()

watch(() => props.issueId, (issueId) => {
  if (issueId && show.value) {
    connect(issueId)
  }
}, { immediate: true })

watch(show, (isOpen) => {
  if (isOpen && props.issueId) {
    connect(props.issueId)
  } else {
    disconnect()
  }
})

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', { hour12: false })
}

onUnmounted(() => {
  disconnect()
})
</script>
