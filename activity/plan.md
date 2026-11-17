# 传奇球馆首页B与离线成长接入

这是已有游戏改造。现有根index.html和src为实际产品源代码，保留既有构建方式；不重建一份演示活动。用户已选择B设计并确认按钮摆正、有档只继续经营；其原话见confirmations/requirements.md。

首页采用已批准的B背景、标题、信息卡和侧栏入口，图鉴、排行、生涯、设置功能保持。离线依照新版技能使用平台时钟、同一逐球随机引擎和共享事务，状态提交成功后才确认平台报告。前端只调用受保护业务接口，服务端自动获取并保管配置。旧档先完整备份后迁移。

复用activity_api，正式部署包在../outputs/home-timeflow-20261117/cloudbase-package，路由清单在../server/gymCloudBaseRoutes.json，业务SQL在migrations/20261117000200_gym_authority.sql。先本机验证，再官方自动开通、验收基线、原地部署和真实登录验收。未知上游提交结果不得假设可重放，不得补造收益。部署授权见confirmations/deploy.md。
