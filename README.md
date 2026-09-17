# 说明
原项目fork自 https://github.com/other-blowsnow/n8n-i18n-chinese
因不更新了，为方便自己使用，所以按照自己需求重新改写。

# n8n 简体中文语言包

本项目为 n8n Editor UI 生成简体中文语言包，并按 n8n Release 版本构建 `editor-ui.tar.gz`，发布到 GitHub Releases。

项目不再构建或发布 Docker 镜像。

## 使用 Release

1. 在本项目 GitHub Releases 下载与 n8n 版本对应的 `editor-ui.tar.gz`。
2. 将压缩包解压，得到 `dist` 目录。
3. 用解压后的 `dist` 替换本地 n8n 安装中的 `n8n-editor-ui/dist` 目录。
4. 设置 n8n 环境变量 `N8N_DEFAULT_LOCALE=zh-CN`。
5. 重启 n8n。
6. docker compose使用方式
变量里添加
N8N_DEFAULT_LOCALE=zh-CN
卷映射添加
[替换为下载的编辑器UI目录]:/usr/local/lib/node_modules/n8n/node_modules/n8n-editor-ui/dist

## 自动运行

自动化由 `.github/workflows/node.js.yml` 完成，触发方式有两种：

- 定时运行：每2小时的第 0 分钟运行一次。
- 手动运行：在 GitHub 仓库的 `Actions` 页面选择 `package editor-ui languages`，点击 `Run workflow`。

每次运行会：

1. 获取 n8n 最新 Release 版本。
2. 每次从 n8n `master` 分支拉取最新英文语言包。
3. 增量翻译新增或变更的英文文本，并自动提交语言包。
4. 检查最新 Release 是否已经发布过对应 tag。
5. 只有发现新 Release 时，才下载对应版本的 n8n 源码并构建 Editor UI。
6. 生成 `editor-ui.tar.gz`。
7. 创建 GitHub Release，并上传压缩包。

如果对应版本的 tag 已存在，workflow 只同步和翻译 `master` 的新文本，不重复构建 Editor UI。

手动运行时可以选择：

- `force_retranslate`：强制重新翻译所有英文文本，会消耗较多 API 额度。
- `force_build`：忽略已有 Release tag，重新构建并更新当前 Release 的 `editor-ui.tar.gz`。

## GitHub 配置

在仓库的 `Settings -> Environments -> test` 中配置以下变量。

### Secrets

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | Secret | OpenAI 兼容接口的 API Key |

### Variables

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `OPENAI_API_BASE` | Variable | OpenAI 兼容接口地址，例如 `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Variable | 使用的模型名称 |
| `OPENAI_API_BATCH_SIZE` | Variable | 每次请求翻译的条目数，建议 `20` |
| `OPENAI_API_CONCURRENT` | Variable | 同时发送的批次数，建议 `5` |

`GITHUB_TOKEN` 由 GitHub Actions 自动提供，不需要手动配置。workflow 需要仓库具备写入 Contents 和创建 Releases 的权限；建议在仓库 `Settings -> Actions -> General -> Workflow permissions` 中启用 `Read and write permissions`。

## 本地运行翻译

安装依赖后，在项目根目录执行：

```shell
npm install
npm run i18n:translate
```

本地需要设置以下环境变量：

```shell
OPENAI_API_KEY=你的API_KEY
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=你的模型名称
OPENAI_API_BATCH_SIZE=20
OPENAI_API_CONCURRENT=5
```

脚本会把多个待翻译文本放进同一个请求中，再并发处理多个批次。比如 `BATCH_SIZE=20`、`CONCURRENT=5` 时，最多同时提交 5 个请求，每个请求最多翻译 20 条文本。批量响应格式异常时，该批次会自动回退为逐条翻译。

也可以在项目根目录创建 `.env` 文件，内容使用同样的 `KEY=VALUE` 格式。`.env` 不应提交到仓库。

## 原理
> editor-ui 支持 i18n，但官方构建通常不包含中文语言包。

1. 手动添加 zh-CN.json 到 editor-ui `/src/plugins/i18n/locales/` 里面，然后重新编译
2. 环境里面设置语言即可正常使用中文  `N8N_DEFAULT_LOCALE=zh-CN`

# 参考 n8n 官方 i18n 介绍
https://github.com/n8n-io/n8n/blob/master/packages/frontend/%40n8n/i18n/docs/README.md
