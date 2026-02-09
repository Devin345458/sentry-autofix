<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-6">
      <h1 class="text-h4 font-weight-bold">Dashboard</h1>
      <v-chip color="success" variant="tonal" prepend-icon="mdi-checkbox-marked-circle">
        Live Updates Active
      </v-chip>
    </div>

    <StatsCards :stats="stats" class="mb-6" />

    <v-row>
      <v-col cols="12" lg="8">
        <IssuesTable :issues="issues" @view-logs="openLogViewer" />
      </v-col>

      <v-col cols="12" lg="4">
        <ProjectsTable
          :projects="projects"
          @add="openProjectModal()"
          @edit="openProjectModal"
          @delete="handleDeleteProject"
        />
      </v-col>
    </v-row>

    <ProjectModal
      v-model="projectModalOpen"
      :project="selectedProject"
      @save="handleSaveProject"
    />

    <LogViewerModal
      v-model="logViewerOpen"
      :issue-id="selectedIssueId"
    />
  </div>
</template>

<script setup lang="ts">
const { data } = await useFetch('/api/status')

const { issues, stats, connect, disconnect, updateStats } = useDashboardSSE()
const { projects, fetchProjects, createProject, updateProject, deleteProject } = useProjects()

// Initialize data from SSR
if (data.value) {
  issues.value = data.value.issues
  stats.value = data.value.stats
}

// Fetch projects
await fetchProjects()

// Connect SSE on mount
onMounted(() => {
  connect()
})

onUnmounted(() => {
  disconnect()
})

// Project modal
const projectModalOpen = ref(false)
const selectedProject = ref<any>(null)

const openProjectModal = (project?: any) => {
  selectedProject.value = project || null
  projectModalOpen.value = true
}

const handleSaveProject = async (project: any) => {
  if (selectedProject.value) {
    await updateProject(project.slug, project)
  } else {
    await createProject(project)
  }
}

const handleDeleteProject = async (slug: string) => {
  if (confirm(`Delete project "${slug}"?`)) {
    await deleteProject(slug)
  }
}

// Log viewer
const logViewerOpen = ref(false)
const selectedIssueId = ref<string | null>(null)

const openLogViewer = (issueId: string) => {
  selectedIssueId.value = issueId
  logViewerOpen.value = true
}
</script>
