<template>
  <v-snackbar
    v-model="show"
    :color="color"
    :timeout="3000"
    location="top right"
  >
    {{ message }}
  </v-snackbar>
</template>

<script setup lang="ts">
const { show, message, color } = useToast()
</script>
