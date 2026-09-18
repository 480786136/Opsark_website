<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { PhCheckCircle, PhPaperPlaneTilt, PhSpinnerGap, PhWarningCircle } from "@phosphor-icons/vue";
import { submitInquiry, validateInquiry } from "../lib/contact";
import type { CommercialInquiry, PlatformId } from "../types";

const props = withDefaults(defineProps<{ requestedPlatform?: PlatformId | "both" }>(), { requestedPlatform: "both" });
const form = reactive<CommercialInquiry>({
  name: "",
  email: "",
  company: "",
  role: "",
  platform: props.requestedPlatform,
  useCase: "",
  consent: false,
  website: "",
});
const errors = ref<Record<string, string>>({});
const state = ref<"idle" | "submitting" | "success" | "error">("idle");
const serverMessage = ref("");

watch(() => props.requestedPlatform, (platform) => {
  form.platform = platform;
});

function clearError(field: string) {
  if (!errors.value[field]) return;
  errors.value = { ...errors.value, [field]: "" };
}

async function handleSubmit() {
  errors.value = validateInquiry(form);
  if (Object.values(errors.value).some(Boolean)) {
    state.value = "error";
    serverMessage.value = "请检查标出的内容。";
    return;
  }
  state.value = "submitting";
  serverMessage.value = "";
  try {
    await submitInquiry(import.meta.env.VITE_CONTACT_ENDPOINT || "/api/contact", { ...form });
    state.value = "success";
  } catch (error) {
    state.value = "error";
    serverMessage.value = error instanceof Error ? error.message : "提交未完成，请稍后再试。";
  }
}
</script>

<template>
  <div class="contact-form-shell">
    <div v-if="state === 'success'" class="contact-success" role="status">
      <PhCheckCircle :size="44" weight="duotone" />
      <h3>意向已提交</h3>
      <p>你的需求已保存，我们会通过你提供的工作邮箱继续沟通。</p>
      <button class="button button-secondary" type="button" @click="state = 'idle'">补充另一项需求</button>
    </div>

    <form v-else novalidate @submit.prevent="handleSubmit">
      <div class="form-grid">
        <label class="field-block">
          <span>姓名</span>
          <input id="contact-name" v-model="form.name" type="text" autocomplete="name" :aria-invalid="Boolean(errors.name)" :aria-describedby="errors.name ? 'contact-name-error' : undefined" @input="clearError('name')" />
          <small v-if="errors.name" id="contact-name-error" class="field-error">{{ errors.name }}</small>
        </label>
        <label class="field-block">
          <span>工作邮箱</span>
          <input v-model="form.email" type="email" autocomplete="email" placeholder="name@company.com" :aria-invalid="Boolean(errors.email)" :aria-describedby="errors.email ? 'contact-email-error' : undefined" @input="clearError('email')" />
          <small v-if="errors.email" id="contact-email-error" class="field-error">{{ errors.email }}</small>
        </label>
        <label class="field-block">
          <span>公司或团队</span>
          <input v-model="form.company" type="text" autocomplete="organization" :aria-invalid="Boolean(errors.company)" :aria-describedby="errors.company ? 'contact-company-error' : undefined" @input="clearError('company')" />
          <small v-if="errors.company" id="contact-company-error" class="field-error">{{ errors.company }}</small>
        </label>
        <label class="field-block">
          <span>你的角色</span>
          <select v-model="form.role" :aria-invalid="Boolean(errors.role)" :aria-describedby="errors.role ? 'contact-role-error' : undefined" @change="clearError('role')">
            <option value="" disabled>请选择</option>
            <option value="sre">运维 / SRE</option>
            <option value="developer">开发者</option>
            <option value="lead">技术负责人</option>
            <option value="business">业务或采购</option>
            <option value="other">其他</option>
          </select>
          <small v-if="errors.role" id="contact-role-error" class="field-error">{{ errors.role }}</small>
        </label>
      </div>

      <fieldset class="platform-fieldset">
        <legend>目标平台</legend>
        <label><input v-model="form.platform" type="radio" name="platform" value="macos" />macOS</label>
        <label><input v-model="form.platform" type="radio" name="platform" value="windows" />Windows</label>
        <label><input v-model="form.platform" type="radio" name="platform" value="both" />两者都需要</label>
      </fieldset>

      <label class="field-block field-wide">
        <span>希望验证的运维场景</span>
        <textarea
          v-model="form.useCase"
          rows="4"
          placeholder="例如：在 20 台测试服务器上完成日常巡检、配置变更与结果复核。"
          :aria-invalid="Boolean(errors.useCase)"
          :aria-describedby="errors.useCase ? 'contact-use-case-helper contact-use-case-error' : 'contact-use-case-helper'"
          @input="clearError('useCase')"
        ></textarea>
        <small id="contact-use-case-helper" class="field-helper">请勿填写密码、密钥、真实 IP 或其他敏感信息。</small>
        <small v-if="errors.useCase" id="contact-use-case-error" class="field-error">{{ errors.useCase }}</small>
      </label>

      <label class="honeypot" aria-hidden="true">网站<input v-model="form.website" type="text" tabindex="-1" autocomplete="off" /></label>

      <label class="consent-field">
        <input v-model="form.consent" type="checkbox" :aria-invalid="Boolean(errors.consent)" :aria-describedby="errors.consent ? 'contact-consent-error' : undefined" @change="clearError('consent')" />
        <span>我同意 OpsArk 团队就本次产品演示或商业合作与我联系。</span>
      </label>
      <small v-if="errors.consent" id="contact-consent-error" class="field-error consent-error">{{ errors.consent }}</small>

      <div class="form-submit-row">
        <button class="button button-primary" type="submit" :disabled="state === 'submitting'">
          <PhSpinnerGap v-if="state === 'submitting'" class="spin" :size="19" />
          <PhPaperPlaneTilt v-else :size="19" weight="bold" />
          {{ state === "submitting" ? "正在提交" : "提交意向" }}
        </button>
        <p v-if="state === 'error'" class="form-status" role="alert"><PhWarningCircle :size="17" />{{ serverMessage }}</p>
      </div>
    </form>
  </div>
</template>
