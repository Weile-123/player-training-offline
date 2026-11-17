# activity_api部署准备包

尚未远程开通或部署。仅适用于官方CloudBase受保护网关；不要求开发者另写authmodule。

1. 通过官方零参数create-cloudbase.js开通/复用活动环境，连接CloudBase官方MCP并先静默login_by_api_key。
2. 验收平台预置基线后，原地更新activity_api，不能创建第二套同类函数。新环境按gym/activity/migrations中001、002、003顺序运行applyMigration；已有002的环境应用001、003升级函数，保留原档。
3. 在cloudfunctions/activity_api执行npm ci --omit=dev --ignore-scripts，依赖按锁安装后打包；本准备包不包含node_modules或凭据。赋予scf_bootstrap可执行权限；functionRootPath为本包cloudfunctions父目录，函数类型HTTP、端口9000。部署复用现有Nodejs18.15；已经官方18.15.0实际运行验证，不改函数运行时。
4. 配置env.example列出的公开绑定与服务端Token。GYM_AUTHORITY_AUTH_MODE仅在官方网关验证Bearer且覆盖context、函数直连已关闭时设cloudbase-gateway。缺省球馆接口503；错误模式或显式配置但缺资源时拒绝启动。
5. 按routes.json为8条球馆路径配置auth=true，榜单按各条公开或受保护标记；所有路径启用WEB_SCF、path transmission及safe domain；查询实际HTTPSERVICE域名，不猜域名、不使用静态托管域名。网关负责CORS。
6. 宿主在旧16KB body parser前分流/api/gym/*到权威handler，复用同一SDK和监听端口；排行榜health/公开查询原处理器保留。迁档上限仍由权威handler校验。
7. 验收无Token拒绝、真实登录隔离、长离线async轮询、事务后ACK及ACK断网重试，再更新前端真实环境配置。仅本机tests不代表线上成功。

routes.json只描述待部署配置，不证明网关已就绪。manifest.json含全部文件SHA256；不含真实秘密、测试身份或生产状态。
