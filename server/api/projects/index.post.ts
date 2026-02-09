import { createProject } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { slug, repo, branch, language, framework } = body

  if (!slug || !repo || !branch || !language || !framework) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: slug, repo, branch, language, framework',
    })
  }

  const project = createProject({ slug, repo, branch, language, framework })
  return project
})
