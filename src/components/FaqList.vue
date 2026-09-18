<script setup lang="ts">
import { PhCaretDown } from "@phosphor-icons/vue";

const items = [
  {
    question: "现在可以直接连接生产环境吗？",
    answer: "建议先在测试环境验证典型任务与审批方式，再根据团队的变更流程逐步应用。产品演示与使用场景评估可以通过商业合作表单联系团队。",
  },
  {
    question: "支持哪些桌面平台？",
    answer: "官网提供 Windows 与 macOS 安装包，发布后可在下载区直接获取，无需填写联系表单。远端运维场景聚焦 SSH 与 Linux。",
  },
  {
    question: "模型与凭据如何处理？",
    answer: "OpsArk Core 可连接 OpenAI-compatible 模型接口。SSH 密码与模型 API Key 使用系统钥匙串保存，模型请求是否离开设备取决于你配置的端点。",
  },
  {
    question: "现阶段适合大型企业统一采购吗？",
    answer: "当前产品优先服务本地单操作者与精简团队。SSO、RBAC、职责分离、集中策略与集中审计属于后续 Enterprise 控制平面范围。",
  },
];
</script>

<template>
  <div class="faq-list">
    <details v-for="item in items" :key="item.question">
      <summary>{{ item.question }}<PhCaretDown :size="18" weight="bold" /></summary>
      <p>{{ item.answer }}</p>
    </details>
  </div>
</template>
