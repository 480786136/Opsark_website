<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>

<template>
  <span class="brand-lockup" :class="{ compact }">
    <span class="brand-mark"><img src="/brand/opsark-brand.svg" alt="" /></span>
    <span class="brand-name">OpsArk <strong>Core</strong></span>
  </span>
</template>
