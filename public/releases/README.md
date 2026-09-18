# OpsArk Core release manifest

将实际 Windows/macOS 安装包放到自己的文件服务器，再为对应平台配置下载地址。安装包准备由产品发布流程负责，官网无需用户提交申请即可直接下载。

`manifest.json` 中将对应平台的 `available` 设为 `true`，填写可访问的 HTTP(S) `url` 或同域 `/downloads/...` 路径。`fileName`、`note`、`sha256` 为可选信息。缺少安装包地址时显示「即将提供」。

默认 `/api/releases` 每次请求读取此文件，修改后用户刷新网页即可生效。若 `.env` 中配置了 `WINDOWS_DOWNLOAD_URL` 或 `MACOS_DOWNLOAD_URL`，对应平台优先使用环境变量的地址；修改环境变量后重启 Node 服务即可。

大型安装包由 Nginx 或 CDN 等文件服务器提供，建议使用版本化文件名和 `Content-Disposition: attachment` 响应头。不要把安装包提交到网站源码仓库。完整步骤见项目根目录的 README。
