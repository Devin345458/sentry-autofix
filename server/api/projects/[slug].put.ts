import { updateProject, getProject } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Slug is required' })
  }

  const existing = getProject(slug)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }

  const body = await readBody(event)
  const { repo, branch, language, framework } = body

  if (!repo || !branch || !language || !framework) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: repo, branch, language, framework',
    })
  }

  const project = updateProject(slug, { repo, branch, language, framework })
  return project
})
