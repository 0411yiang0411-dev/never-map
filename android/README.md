# never-map Android

独立 Android WebView 客户端，打开现有 HTTPS 画布。Android 8.0 及以上，建议保持 Android System WebView 更新。网页和 Cloudflare 部署不受此项目构建影响。

## 使用

从仓库 Releases 下载签名 APK，允许当前下载来源安装应用。首次输入原有个人访问密码；应用不内置密码。使用同一云端账户时画布共用，但应用本机缓存与系统浏览器隔离；浏览器未同步的画布请先同步或导出后导入。旋转屏幕保留网页实例，手势与笔工具由网页处理。

文件导入通过系统选择器；PNG、画布备份等 Blob 下载通过系统保存器导出，不申请整个存储空间权限。单次导出限制 32 MiB，超过时仍保留原画布，可在浏览器导出。外部 HTTPS 链接交给浏览器；只向固定网站主页面提供文件保存桥，不绕过 HTTPS 验证。

顶部菜单提供刷新、连接检测、浏览器打开和 GitHub 源码入口。系统 WebView 与红米浏览器不同，但客户端不能保证解决设备网络的连接关闭问题。尚需真实 Pad 安装验证触控笔、手势、文件保存及连接状况。

## 自动构建

App 画布界面顶部使用单行操作栏，宽度不足时可左右滑动。网页就绪后收起原生标题栏，应用菜单移到该行末尾的 ⋮ 按钮；连接错误或检测页面仍保留原生导航，避免无法返回。

修改 `android/` 并推送 main，或手动运行 GitHub Actions 的 **Build Android APK**。工作流使用 JDK 17、Gradle 8.11.1、Android SDK 35，执行 Release 单元测试、Lint、APK 构建及签名验证。成功结果位于 `never-map-android` artifact，保留 7 天；正式可下载版本另存 Releases。

签名材料仅存 GitHub Actions 加密 Secrets：`NEVER_MAP_KEYSTORE_BASE64` 和 `NEVER_MAP_STORE_PASSWORD`。密钥别名 `never-map`，PKCS12。私有本机备份在项目 `.cache/android-signing/`，不得提交或公开；丢失签名密钥将无法覆盖升级。版本号使用工作流 run number，请始终使用同一工作流生成升级包。

本机构建需预先准备 Java 17、Gradle 8.11.1、SDK 35，设置项目内的 `GRADLE_USER_HOME`、`ANDROID_USER_HOME` 与临时目录，然后执行 `gradle -p android testReleaseUnitTest lintRelease assembleRelease`。Release 签名还需设置 `NEVER_MAP_KEYSTORE_PATH`、`NEVER_MAP_STORE_PASSWORD`，不要将其写入源码或命令日志。

此客户端不增加服务端资源，不更改 R2/D1 限额及自动暂停策略；云端请求继续由现有网页和 Worker 管理。APK 不包含离线网页副本，首次加载需要网络。
