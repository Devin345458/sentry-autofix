export const useToast = () => {
  const show = useState('toast-show', () => false)
  const message = useState('toast-message', () => '')
  const color = useState('toast-color', () => 'success')

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    message.value = msg
    color.value = type
    show.value = true
  }

  return {
    show,
    message,
    color,
    showToast,
  }
}
