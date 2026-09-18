<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Component } from "vue";
import {
  PhArrowDown,
  PhArrowRight,
  PhArrowUpRight,
  PhArrowsLeftRight,
  PhBrain,
  PhCheckCircle,
  PhDesktop,
  PhFolderOpen,
  PhKey,
  PhList,
  PhMoon,
  PhShieldCheck,
  PhSun,
  PhTerminalWindow,
  PhX,
} from "@phosphor-icons/vue";
import BrandLockup from "./components/BrandLockup.vue";
import ContactForm from "./components/ContactForm.vue";
import DownloadCenter from "./components/DownloadCenter.vue";
import FaqList from "./components/FaqList.vue";

type Theme = "dark" | "light";

const audiences = [
  {
    id: "sre",
    label: "运维 / SRE",
    problem: "终端、文件、聊天与记录彼此分散，关键上下文总在切换中丢失。",
    outcome: "在同一桌面工作台查看环境、组织步骤、执行命令并复核结果。",
  },
  {
    id: "lead",
    label: "技术负责人",
    problem: "想提高执行效率，又不愿把高风险操作交给不可解释的黑盒。",
    outcome: "先看计划与风险，再按授权模式决定哪些步骤需要人工确认。",
  },
  {
    id: "partner",
    label: "Design Partner",
    problem: "通用演示很难反映真实基础设施约束，也无法验证团队的控制要求。",
    outcome: "从测试或非关键环境开始，共同定义场景、边界与退出机制。",
  },
];

const flowSteps = [
  { title: "提出需求", detail: "说明目标、对象与限制条件，不必先拼出完整命令。" },
  { title: "生成计划", detail: "把需求拆成带命令、风险、预期与校验方式的结构化步骤。" },
  { title: "审查批准", detail: "在执行前看清将要发生什么，并按授权模式保留控制权。" },
  { title: "分步执行", detail: "通过真实 SSH 会话运行已批准步骤，终端同步呈现回显。" },
  { title: "独立校验", detail: "执行后使用只读检查验证目标状态，不把退出码当作唯一答案。" },
  { title: "处理异常", detail: "根据证据说明失败与偏差，必要时生成有边界的调整方案。" },
  { title: "留下证据", detail: "把计划、批准、命令、结果与总结保留在任务时间线中。" },
];

const capabilities: Array<{
  title: string;
  copy: string;
  icon: Component;
  className: string;
  visual?: "vault";
}> = [
  {
    title: "本地优先的执行端",
    copy: "Core 安装在操作者桌面，直接连接约定的 SSH 目标。界面与执行边界清晰分工。",
    icon: PhDesktop,
    className: "feature-local",
    visual: "vault",
  },
  {
    title: "三种控制模式",
    copy: "逐步确认、安全模式与完全托管覆盖不同自动化程度，高风险操作仍要求确认。",
    icon: PhShieldCheck,
    className: "feature-control",
  },
  {
    title: "敏感信息有归处",
    copy: "SSH 密码与模型 API Key 使用系统钥匙串保存，不把明文当作普通界面状态。",
    icon: PhKey,
    className: "feature-keychain",
  },
  {
    title: "执行完成还要验证",
    copy: "只读校验、结构化证据和结果总结帮助你确认目标状态，而不只看到一条成功提示。",
    icon: PhCheckCircle,
    className: "feature-verify",
  },
  {
    title: "模型选择不被锁死",
    copy: "可配置 OpenAI-compatible 模型接口，让团队根据安全、成本与能力要求选择端点。",
    icon: PhArrowsLeftRight,
    className: "feature-model",
  },
];

const menuOpen = ref(false);
const activeAudience = ref(0);
const activeFlow = ref(0);
const ready = ref(false);
const storedTheme = localStorage.getItem("opsark.website.theme");
const theme = ref<Theme>(storedTheme === "light" || storedTheme === "dark"
  ? storedTheme
  : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
const activeAudienceCopy = computed(() => audiences[activeAudience.value]);
let revealObserver: IntersectionObserver | undefined;

function applyTheme(nextTheme: Theme) {
  theme.value = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("opsark.website.theme", nextTheme);
}

function closeMenu() {
  menuOpen.value = false;
}

function handleAudienceKeydown(event: KeyboardEvent, index: number) {
  let nextIndex = index;
  if (event.key === "ArrowRight") nextIndex = (index + 1) % audiences.length;
  else if (event.key === "ArrowLeft") nextIndex = (index - 1 + audiences.length) % audiences.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = audiences.length - 1;
  else return;
  event.preventDefault();
  activeAudience.value = nextIndex;
  void nextTick(() => document.querySelector<HTMLElement>(`#audience-tab-${audiences[nextIndex].id}`)?.focus());
}

function moveMagnet(event: PointerEvent) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || event.pointerType === "touch") return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = (event.clientX - rect.left - rect.width / 2) * 0.12;
  const y = (event.clientY - rect.top - rect.height / 2) * 0.18;
  target.style.setProperty("--magnet-x", `${x}px`);
  target.style.setProperty("--magnet-y", `${y}px`);
}

function resetMagnet(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  target.style.setProperty("--magnet-x", "0px");
  target.style.setProperty("--magnet-y", "0px");
}

function tiltProduct(event: PointerEvent) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || event.pointerType === "touch") return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  target.style.setProperty("--tilt-x", `${(-y * 3.2).toFixed(2)}deg`);
  target.style.setProperty("--tilt-y", `${(x * 4.5).toFixed(2)}deg`);
  target.style.setProperty("--spot-x", `${((x + 0.5) * 100).toFixed(1)}%`);
  target.style.setProperty("--spot-y", `${((y + 0.5) * 100).toFixed(1)}%`);
}

function resetProduct(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  target.style.setProperty("--tilt-x", "0deg");
  target.style.setProperty("--tilt-y", "0deg");
  target.style.setProperty("--spot-x", "50%");
  target.style.setProperty("--spot-y", "30%");
}

onMounted(() => {
  applyTheme(theme.value);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) ready.value = true;
  else window.requestAnimationFrame(() => { ready.value = true; });

  revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      revealObserver?.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -7%" });
  document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => revealObserver?.observe(element));
});

onBeforeUnmount(() => revealObserver?.disconnect());
</script>

<template>
  <div class="site" :class="{ ready }">
    <header class="site-header">
      <a class="header-brand" href="#top" aria-label="OpsArk Core 首页" @click="closeMenu">
        <BrandLockup />
      </a>
      <nav id="site-navigation" :class="{ open: menuOpen }" aria-label="主导航">
        <a href="#audience" @click="closeMenu">适用团队</a>
        <a href="#workflow" @click="closeMenu">工作方式</a>
        <a href="#capabilities" @click="closeMenu">产品能力</a>
        <a href="#download" @click="closeMenu">下载</a>
      </nav>
      <div class="header-actions">
        <button
          class="theme-toggle"
          type="button"
          :aria-label="theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          @click="applyTheme(theme === 'dark' ? 'light' : 'dark')"
        >
          <PhSun v-if="theme === 'dark'" :size="18" />
          <PhMoon v-else :size="18" />
        </button>
        <a class="header-cta" href="#contact">商业合作<PhArrowUpRight :size="16" weight="bold" /></a>
        <button
          class="menu-toggle"
          type="button"
          :aria-expanded="menuOpen"
          aria-controls="site-navigation"
          :aria-label="menuOpen ? '关闭导航' : '打开导航'"
          @click="menuOpen = !menuOpen"
        >
          <PhX v-if="menuOpen" :size="22" />
          <PhList v-else :size="22" />
        </button>
      </div>
    </header>

    <main>
      <section id="top" class="hero section-shell">
        <div class="hero-grid"></div>
        <div class="hero-copy">
          <p class="eyebrow">OPSARK CORE / DESKTOP OPERATIONS</p>
          <h1>运维执行，<strong>有计划，有证据。</strong></h1>
          <p class="hero-intro">本地桌面智能运维工作台，把需求、审批、执行与校验收进一个清晰闭环。</p>
          <div class="hero-actions">
            <a
              class="button button-primary magnetic"
              href="#download"
              @pointermove="moveMagnet"
              @pointerleave="resetMagnet"
            >下载产品<PhArrowRight :size="18" weight="bold" /></a>
            <a class="button button-ghost" href="#workflow">查看工作流<PhArrowDown :size="17" weight="bold" /></a>
          </div>
        </div>

        <div
          class="hero-product-wrap"
          @pointermove="tiltProduct"
          @pointerleave="resetProduct"
        >
          <div class="hero-product-glint"></div>
          <figure class="product-frame hero-frame">
            <div class="product-frame-bar"><span>OpsArk Core</span><small>脱敏演示</small></div>
            <img src="/media/core-workspace.png" alt="OpsArk Core 的 SFTP、SSH 终端与智能任务三栏工作台" width="1440" height="900" fetchpriority="high" />
            <figcaption>真实桌面端界面，使用脱敏演示数据</figcaption>
          </figure>
        </div>
      </section>

      <section id="audience" class="audience-section section-shell" data-reveal>
        <header class="section-heading section-heading-narrow">
          <h2>为需要亲手把关的技术团队而生</h2>
          <p>从单人运维到精简平台团队，减少工具切换，也保留每一步决定权。</p>
        </header>
        <div class="audience-console">
          <div class="audience-tabs" role="tablist" aria-label="选择团队角色">
            <button
              v-for="(audience, index) in audiences"
              :id="`audience-tab-${audience.id}`"
              :key="audience.id"
              type="button"
              role="tab"
              :aria-selected="activeAudience === index"
              aria-controls="audience-panel"
              :tabindex="activeAudience === index ? 0 : -1"
              :class="{ active: activeAudience === index }"
              @click="activeAudience = index"
              @keydown="handleAudienceKeydown($event, index)"
            >
              {{ audience.label }}
            </button>
          </div>
          <Transition name="audience-swap" mode="out-in">
            <div
              id="audience-panel"
              :key="activeAudienceCopy.id"
              class="audience-detail"
              role="tabpanel"
              :aria-labelledby="`audience-tab-${activeAudienceCopy.id}`"
            >
              <div>
                <span>今天的阻力</span>
                <p>{{ activeAudienceCopy.problem }}</p>
              </div>
              <PhArrowRight class="audience-arrow" :size="28" weight="light" />
              <div>
                <span>用 OpsArk 改变</span>
                <p>{{ activeAudienceCopy.outcome }}</p>
              </div>
            </div>
          </Transition>
        </div>
      </section>

      <section id="workflow" class="workflow-section section-shell" data-reveal>
        <div class="workflow-copy">
          <h2>一句需求，不是一次盲目执行</h2>
          <p>OpsArk 把自动化拆成可以看见、批准、验证和追溯的连续动作。</p>
          <div class="workflow-current" aria-live="polite">
            <span>{{ flowSteps[activeFlow].title }}</span>
            <p>{{ flowSteps[activeFlow].detail }}</p>
          </div>
        </div>
        <div class="workflow-track" aria-label="OpsArk 执行闭环">
          <button
            v-for="(step, index) in flowSteps"
            :key="step.title"
            type="button"
            :class="{ active: activeFlow === index, passed: activeFlow > index }"
            @mouseenter="activeFlow = index"
            @focus="activeFlow = index"
            @click="activeFlow = index"
          >
            <i><PhCheckCircle v-if="activeFlow > index" :size="17" weight="fill" /></i>
            <span>{{ step.title }}</span>
          </button>
        </div>
      </section>

      <section class="product-section" data-reveal>
        <div class="section-shell">
          <header class="section-heading product-heading">
            <p class="eyebrow">真实桌面工作台</p>
            <h2>文件、终端和 Agent，不再彼此割裂</h2>
            <p>同一台服务器的环境信息、文件操作、命令回显和任务进度保持在同一上下文中。</p>
          </header>
          <figure class="product-frame product-showcase">
            <div class="product-frame-bar"><span>服务器总览</span><small>脱敏演示</small></div>
            <img src="/media/core-dashboard.png" alt="OpsArk Core 的服务器管理与资源信息总览" width="1440" height="900" loading="lazy" />
            <figcaption>真实桌面端界面，使用脱敏演示数据</figcaption>
          </figure>
          <div class="product-lanes">
            <article><PhFolderOpen :size="24" weight="duotone" /><h3>SFTP 文件区</h3><p>浏览目录、传输小文件并记录变更。</p></article>
            <article><PhTerminalWindow :size="24" weight="duotone" /><h3>真实 SSH 终端</h3><p>保留熟悉的命令操作与实时回显。</p></article>
            <article><PhBrain :size="24" weight="duotone" /><h3>智能任务面板</h3><p>围绕目标组织计划、审批、验证与总结。</p></article>
          </div>
        </div>
      </section>

      <section id="capabilities" class="capabilities-section section-shell" data-reveal>
        <header class="section-heading section-heading-narrow">
          <h2>控制权始终留在你手里</h2>
          <p>AI 负责帮助理解与组织，真实执行仍要经过明确边界。</p>
        </header>
        <div class="capability-grid">
          <article v-for="feature in capabilities" :key="feature.title" class="capability-card" :class="feature.className">
            <img v-if="feature.visual === 'vault'" src="/media/opsark-signal-vault.png" alt="分散运维信号经过多层控制后汇聚为受保护的证据核心" loading="lazy" />
            <div class="capability-card-copy">
              <component :is="feature.icon" :size="27" weight="duotone" />
              <h3>{{ feature.title }}</h3>
              <p>{{ feature.copy }}</p>
            </div>
          </article>
        </div>
      </section>

      <section id="download" class="download-section" data-reveal>
        <div class="section-shell">
          <header class="section-heading download-heading">
            <p class="eyebrow">WINDOWS + MACOS</p>
            <h2>选择你的桌面</h2>
            <p>选择 Windows 或 macOS 版本，点击即可下载安装包。</p>
          </header>
          <DownloadCenter />
        </div>
      </section>

      <section id="contact" class="contact-section section-shell" data-reveal>
        <div class="contact-intro">
          <h2 id="contact-heading" tabindex="-1">把你的真实运维场景带来</h2>
          <p>告诉我们服务器规模、典型任务与安全要求，我们会共同确认产品是否适合。</p>
          <div class="contact-fit">
            <article>
              <span>沟通内容</span>
              <strong>团队规模与典型场景</strong>
            </article>
            <article>
              <span>适合验证</span>
              <strong>巡检、标准化变更、AI 辅助运维</strong>
            </article>
            <article>
              <span>合作方式</span>
              <strong>产品演示与商业合作</strong>
            </article>
          </div>
        </div>
        <ContactForm />
      </section>

      <section class="faq-section section-shell" data-reveal>
        <header class="section-heading section-heading-narrow">
          <h2>开始之前，先把边界说清楚</h2>
        </header>
        <FaqList />
      </section>
    </main>

    <footer class="site-footer section-shell">
      <BrandLockup compact />
      <p>面向 SSH 与 Linux 场景的本地桌面智能运维控制台。</p>
      <div>
        <a href="#workflow">工作方式</a>
        <a href="#download">下载</a>
        <a href="#contact">商业合作</a>
      </div>
      <small>© 2026 OpsArk Core.</small>
    </footer>
  </div>
</template>
