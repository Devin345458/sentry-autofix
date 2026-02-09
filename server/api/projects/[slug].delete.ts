import { deleteProject, getProject } from '../../utils/db'

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Slug is required' })
  }

  const existing = getProject(slug)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }

  deleteProject(slug)
  return { success: true }
})
