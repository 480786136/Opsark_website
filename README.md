# OpsArk Website

OpsArk Core 的独立产品官网，使用 Vue 3、TypeScript、Vite 与原生 CSS 构建。项目位于 `Opsark_website/`，不会修改 `Opsark_core`、`Opsark_admin` 或 `Opsark_knowledge`。

## 设计方向

- 页面类型：面向运维、DevOps/SRE、技术负责人和 Design Partner 的产品官网。
- 视觉语言：Carbon 深色基底、品牌信号绿、工业材质与真实产品界面。
- 设计参数：`DESIGN_VARIANCE 8`、`MOTION_INTENSITY 8`、`VISUAL_DENSITY 5`。
- 产品名称：统一使用 `OpsArk Core`，下载版本按发布清单展示 Preview 或 stable 渠道。用户可直接下载已发布的 Windows/macOS 安装包。
- 动效实现：CSS transform/opacity、IntersectionObserver、直接写入 CSS 变量的指针反馈，并完整支持 `prefers-reduced-motion`。

官网受众分析基于以下仓库事实与合理推断：

- `../docs/OpsArk商业产品级优化方案-2026-09-15.md`
- `../Opsark_core/README.md`
- `../Opsark_core/docs/IMPLEMENTATION_PLAN.md`
- `../Opsark_core/src/features/preferences/i18n.ts`

现阶段更适合本地单操作者、精简运维团队和愿意从测试或非关键环境开始的 Design Partner。SSO、RBAC、职责分离、集中策略和集中审计属于后续 Enterprise 范围。

## 本地运行

环境要求：Node.js 22.12 或更高版本。

```bash
npm install
cp .env.example .env
npm run dev
```

打开 `http://127.0.0.1:5176`。`npm run dev` 同时提供 Vite 开发页面和同源商务联系接口。

## 构建与启动

```bash
npm run typecheck
npm test
npm run build
npm start
```

生产服务会从 `dist/` 提供静态文件，同时提供下载配置与意向提交接口。默认监听 `127.0.0.1:5176`，可通过 `HOST` 和 `PORT` 调整。启动时自动读取项目根目录 `.env`，进程环境变量优先。

部署时保留 `server/`、`public/releases/manifest.json`、`dist/`、`package.json` 和 `.env`，通过 `npm start` 运行。只上传 `dist/` 到静态站点无法保存意向信息。

## 商务联系功能

`POST /api/contact` 会校验字段、限制请求大小、使用蜜罐字段过滤机器人，并对来源地址执行内存速率限制。有效意向信息逐条追加到磁盘文件，确认写入后才向界面返回成功。默认保存位置：

```text
runtime/leads.jsonl
```

每行是一条完整 JSON，包含意向编号、提交时间、姓名、工作邮箱、公司/团队、角色、目标平台、需求说明和联系授权。服务重启不会清空记录。该文件不提供公开查询接口。

服务器上建议将 `.env` 的保存位置设到网站代码目录之外，例如：

```dotenv
CONTACT_STORAGE_PATH=/srv/opsark/data/leads.jsonl
```

给运行 Node 服务的账号该目录的写入权限。网站更新时保留此目录；使用容器时将其挂载为持久卷。可在服务器上查看 `tail -n 20 /srv/opsark/data/leads.jsonl`，并按自己的备份策略备份该目录。

该目录已经加入 `.gitignore`。生产部署应限制文件权限、设置备份与保留期限，并建立明确的访问责任人。可用 `CONTACT_STORAGE_PATH` 修改保存位置，但服务器会拒绝把线索写入公开 `dist/` 目录；设置 `CONTACT_WEBHOOK_URL` 后，服务端会在本地保存成功后把同一条线索转发到 HTTPS webhook，非 HTTPS 地址会在启动时被拒绝。不要把 webhook 密钥放进 `VITE_*` 变量。

若部署在可信反向代理之后，把 `TRUST_PROXY_HOPS` 设为实际可信代理层数；只有在公网无法绕过该代理直接访问服务时才应开启。默认为 `0`，不信任客户端可伪造的 `X-Forwarded-For`。

## Windows 与 macOS 下载

将安装包上传到自己的服务器，并确保下载 URL 可访问。推荐在 `.env` 配置两个地址：

```dotenv
WINDOWS_DOWNLOAD_URL=https://your-domain.example/downloads/OpsArk-Core-Setup.exe
MACOS_DOWNLOAD_URL=https://your-domain.example/downloads/OpsArk-Core.dmg
```

将示例域名替换为实际域名。配置后重启 `npm start`，首页的「下载产品」进入下载区，Windows/macOS 按钮会直接请求对应文件，无需填写意向表单。SHA-256 是可选展示信息，不影响下载按钮可用性。尚未配置地址的平台显示「即将提供」。

也支持 HTTP 地址和同域路径，例如 `WINDOWS_DOWNLOAD_URL=/downloads/OpsArk-Core-Setup.exe`。跨域服务器应给安装包返回 `Content-Disposition: attachment`，确保浏览器按下载处理。

页面默认读取同源 `/api/releases`，服务端会在每次请求时读取 `public/releases/manifest.json`；非空的 `WINDOWS_DOWNLOAD_URL` / `MACOS_DOWNLOAD_URL` 优先覆盖对应平台。修改 `.env` 后需要重启服务，不需要重新构建前端。

若希望换包后连服务也不重启，可将上述两个环境变量留空，直接编辑 `public/releases/manifest.json`：

```json
{
  "channel": "preview",
  "updatedAt": "2026-09-15",
  "platforms": {
    "windows": {
      "available": true,
      "url": "/downloads/OpsArk-Core-Setup.exe",
      "package": "NSIS",
      "fileName": "OpsArk-Core-Setup.exe"
    },
    "macos": {
      "available": true,
      "url": "/downloads/OpsArk-Core.dmg",
      "package": "DMG",
      "fileName": "OpsArk-Core.dmg"
    }
  }
}
```

保存后用户刷新网页即可读取新地址。可选填 `sha256`（64 位十六进制校验和）和 `note`（版本说明）。安装包由自己的文件服务器、Nginx 或 CDN 提供；不放进官网的 `dist/`，以便大型安装包使用流式下载和断点续传。

项目附带 [Nginx 配置示例](deploy/nginx.conf.example)：安装包目录为 `/srv/opsark/downloads/`，`/downloads/` 由 Nginx 直接提供，其他请求转发给本机 `5176` 端口的 Node 服务。按服务器实际域名和目录修改后使用；HTTPS 证书由现有网关配置。

如自行改用跨域清单接口，设置 `VITE_DOWNLOAD_MANIFEST_URL` 并重新构建前端，同时将该 HTTPS origin 加入 `CSP_CONNECT_SRC`；远端接口需允许官网域名的跨域请求。

## 视觉资产来源

- `public/brand/opsark-brand.svg`、`app-icon.png` 与 `favicon.png` 来自 OpsArk Core 品牌资产。
- `public/media/core-workspace.png` 与 `core-dashboard.png` 从现有 Core 页面使用脱敏演示数据捕获，不是拼装的假界面。
- `public/media/opsark-signal-vault.png` 使用内置 imagegen 生成，表达“信号经过控制后汇聚为证据”的产品叙事，不包含界面或文字。

## 验证

```bash
npm run typecheck
npm test
npm run test:server
npm run build
npm run test:e2e
```

端到端测试覆盖首屏、受众切换、执行闭环、Windows/macOS 直接下载、未配置状态、意向表单和移动导航。服务端集成测试验证意向文件实际落盘、并发提交、重启保留、保存失败，以及运行时下载配置。

如需验证已在运行的生产服务，可设置 `PLAYWRIGHT_BASE_URL` 后运行同一组测试；此时 Playwright 不会另外启动开发服务。也可以在构建后设置 `PLAYWRIGHT_SERVER_COMMAND="npm start"`，由 Playwright 自动启动生产服务并在测试结束后关闭。
# Opsark_website
