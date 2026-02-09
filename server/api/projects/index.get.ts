import { getAllProjects } from '../../utils/db'

export default defineEventHandler(() => {
  return getAllProjects()
})
