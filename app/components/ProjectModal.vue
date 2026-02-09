<template>
  <v-dialog v-model="show" max-width="600">
    <v-card>
      <v-card-title>
        <span class="text-h5">{{ isEdit ? 'Edit Project' : 'Add Project' }}</span>
      </v-card-title>

      <v-card-text>
        <v-form ref="form" @submit.prevent="handleSubmit">
          <v-text-field
            v-model="formData.slug"
            label="Project Slug"
            :readonly="isEdit"
            :rules="[required]"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          />

          <v-text-field
            v-model="formData.repo"
            label="Repository (owner/repo)"
            :rules="[required]"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          />

          <v-text-field
            v-model="formData.branch"
            label="Branch"
            :rules="[required]"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          />

          <v-text-field
            v-model="formData.language"
            label="Language"
            :rules="[required]"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          />

          <v-text-field
            v-model="formData.framework"
            label="Framework"
            :rules="[required]"
            variant="outlined"
            density="comfortable"
          />
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="show = false">
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          @click="handleSubmit"
        >
          {{ isEdit ? 'Update' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
interface Props {
  modelValue: boolean
  project?: any
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue', 'save'])

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const isEdit = computed(() => !!props.project)

const formData = ref({
  slug: '',
  repo: '',
  branch: 'main',
  language: '',
  framework: '',
})

const loading = ref(false)
const form = ref<any>(null)

const required = (v: any) => !!v || 'Required'

watch(() => props.project, (project) => {
  if (project) {
    formData.value = {
      slug: project.slug,
      repo: project.repo,
      branch: project.branch,
      language: project.language,
      framework: project.framework,
    }
  } else {
    formData.value = {
      slug: '',
      repo: '',
      branch: 'main',
      language: '',
      framework: '',
    }
  }
}, { immediate: true })

const handleSubmit = async () => {
  const { valid } = await form.value.validate()
  if (!valid) return

  loading.value = true
  try {
    emit('save', formData.value)
    show.value = false
  } finally {
    loading.value = false
  }
}
</script>
