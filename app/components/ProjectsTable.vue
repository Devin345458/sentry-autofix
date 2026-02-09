<template>
  <v-card>
    <v-card-title class="d-flex align-center justify-space-between">
      <div class="d-flex align-center">
        <v-icon icon="mdi-folder-multiple" class="mr-2" />
        Projects
      </div>
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        @click="$emit('add')"
      >
        Add Project
      </v-btn>
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="projectsArray"
      :items-per-page="10"
      density="comfortable"
    >
      <template #item.repo="{ item }">
        <span class="monospace">{{ item.repo }}</span>
      </template>

      <template #item.branch="{ item }">
        <v-chip size="small" variant="tonal">
          {{ item.branch }}
        </v-chip>
      </template>

      <template #item.stack="{ item }">
        <div class="text-caption">
          {{ item.language }} / {{ item.framework }}
        </div>
      </template>

      <template #item.actions="{ item }">
        <v-btn
          icon="mdi-pencil"
          size="small"
          variant="text"
          @click="$emit('edit', item)"
        />
        <v-btn
          icon="mdi-delete"
          size="small"
          variant="text"
          color="error"
          @click="$emit('delete', item.slug)"
        />
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
interface Props {
  projects: Record<string, any>
}

const props = defineProps<Props>()
defineEmits(['add', 'edit', 'delete'])

const headers = [
  { title: 'Slug', key: 'slug', sortable: true },
  { title: 'Repository', key: 'repo', sortable: true },
  { title: 'Branch', key: 'branch', sortable: true },
  { title: 'Stack', key: 'stack', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false, align: 'end' },
]

const projectsArray = computed(() => {
  return Object.entries(props.projects).map(([slug, config]) => ({
    slug,
    ...config,
  }))
})
</script>
