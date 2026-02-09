export const useProjects = () => {
  const { showToast } = useToast()

  const projects = useState<Record<string, any>>('projects', () => ({}))
  const loading = useState('projects-loading', () => false)

  const fetchProjects = async () => {
    loading.value = true
    try {
      const data = await $fetch('/api/projects')
      projects.value = data
    } catch (err: any) {
      showToast('Failed to fetch projects', 'error')
      console.error(err)
    } finally {
      loading.value = false
    }
  }

  const createProject = async (project: any) => {
    try {
      await $fetch('/api/projects', {
        method: 'POST',
        body: project,
      })
      showToast('Project created successfully', 'success')
      await fetchProjects()
    } catch (err: any) {
      showToast('Failed to create project', 'error')
      throw err
    }
  }

  const updateProject = async (slug: string, project: any) => {
    try {
      await $fetch(`/api/projects/${slug}`, {
        method: 'PUT',
        body: project,
      })
      showToast('Project updated successfully', 'success')
      await fetchProjects()
    } catch (err: any) {
      showToast('Failed to update project', 'error')
      throw err
    }
  }

  const deleteProject = async (slug: string) => {
    try {
      await $fetch(`/api/projects/${slug}`, {
        method: 'DELETE',
      })
      showToast('Project deleted successfully', 'success')
      await fetchProjects()
    } catch (err: any) {
      showToast('Failed to delete project', 'error')
      throw err
    }
  }

  return {
    projects,
    loading,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  }
}
