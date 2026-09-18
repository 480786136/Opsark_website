<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import {
  PhAppleLogo,
  PhCheck,
  PhCopy,
  PhDownloadSimple,
  PhWarningCircle,
  PhWindowsLogo,
} from "@phosphor-icons/vue";
import { detectPlatform, emptyManifest, loadReleaseManifest } from "../lib/releaseManifest";
import type { PlatformId, ReleaseManifest } from "../types";

const manifest = ref<ReleaseManifest>(emptyManifest);
const loading = ref(true);
const loadError = ref("");
const selected = ref<PlatformId>("macos");
const copied = ref(false);

const platformCopy = {
  macos: {
    name: "macOS",
    short: "Mac",
    description: "面向 Apple 桌面设备的 DMG 安装包。",
    icon: PhAppleLogo,
  },
  windows: {
    name: "Windows",
    short: "Windows",
    description: "面向 Windows 桌面设备的 NSIS 安装程序。",
    icon: PhWindowsLogo,
  },
};

const current = computed(() => manifest.value.platforms[selected.value]);
const currentCopy = computed(() => platformCopy[selected.value]);
const platformKeys: PlatformId[] = ["macos", "windows"];

onMounted(async () => {
  selected.value = detectPlatform(navigator.userAgent);
  await loadReleases();
});

async function loadReleases() {
  loading.value = true;
  loadError.value = "";
  manifest.value = emptyManifest;
  try {
    manifest.value = await loadReleaseManifest(import.meta.env.VITE_DOWNLOAD_MANIFEST_URL || "/api/releases");
  } catch {
    loadError.value = "下载信息暂时无法加载，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

async function copyChecksum() {
  if (!current.value.sha256) return;
  try {
    await navigator.clipboard.writeText(current.value.sha256);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 1800);
  } catch {
    copied.value = false;
  }
}

function handlePlatformKeydown(event: KeyboardEvent, index: number) {
  let nextIndex = index;
  if (event.key === "ArrowRight") nextIndex = (index + 1) % platformKeys.length;
  else if (event.key === "ArrowLeft") nextIndex = (index - 1 + platformKeys.length) % platformKeys.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = platformKeys.length - 1;
  else return;
  event.preventDefault();
  selected.value = platformKeys[nextIndex];
  void nextTick(() => document.querySelector<HTMLElement>(`#platform-tab-${platformKeys[nextIndex]}`)?.focus());
}
</script>

<template>
  <div class="download-shell">
    <div class="platform-switch" role="tablist" aria-label="选择下载平台">
      <button
        v-for="(item, key, index) in platformCopy"
        :id="`platform-tab-${key}`"
        :key="key"
        type="button"
        role="tab"
        :aria-selected="selected === key"
        aria-controls="platform-panel"
        :tabindex="selected === key ? 0 : -1"
        :class="{ active: selected === key }"
        @click="selected = key"
        @keydown="handlePlatformKeydown($event, index)"
      >
        <component :is="item.icon" :size="21" weight="fill" />
        {{ item.name }}
      </button>
    </div>

    <div
      id="platform-panel"
      class="download-panel"
      role="tabpanel"
      :aria-labelledby="`platform-tab-${selected}`"
    >
      <div class="download-product-icon" aria-hidden="true">
        <img src="/brand/app-icon.png" alt="" />
      </div>

      <div class="download-copy">
        <p class="download-platform"><component :is="currentCopy.icon" :size="18" weight="fill" />{{ currentCopy.name }}</p>
        <h3>OpsArk Core{{ manifest.channel === 'preview' ? ' Preview' : '' }}</h3>
        <p>{{ currentCopy.description }}</p>
        <div v-if="loading" class="release-skeleton" aria-label="正在读取下载信息">
          <i></i><i></i>
        </div>
        <p v-else-if="loadError" class="release-message is-warning"><PhWarningCircle :size="17" />{{ loadError }}</p>
        <template v-else>
          <dl class="release-facts">
            <div><dt>安装格式</dt><dd>{{ current.package }}</dd></div>
            <div><dt>下载状态</dt><dd>{{ current.available ? "可直接下载" : "即将提供" }}</dd></div>
          </dl>
          <p v-if="current.note" class="release-note">{{ current.note }}</p>
        </template>
      </div>

      <div class="download-action">
        <a
          v-if="current.available"
          class="button button-primary"
          :href="current.url"
          :download="current.fileName || ''"
        >
          <PhDownloadSimple :size="19" weight="bold" />下载 {{ currentCopy.short }}
        </a>
        <button v-else-if="loadError" class="button button-secondary" type="button" @click="loadReleases">
          重新加载
        </button>
        <button v-else class="button button-primary" type="button" disabled>
          {{ loading ? "正在加载" : `${currentCopy.short} 版即将提供` }}
        </button>
        <button v-if="current.available && current.sha256" class="checksum-button" type="button" @click="copyChecksum">
          <PhCheck v-if="copied" :size="16" weight="bold" />
          <PhCopy v-else :size="16" />
          {{ copied ? "已复制校验和" : "复制 SHA-256" }}
        </button>
        <p v-if="!loading && !loadError && !current.available">安装包准备中，请稍后再来。</p>
      </div>
    </div>
  </div>
</template>
