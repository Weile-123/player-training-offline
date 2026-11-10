# 王牌训练师本地复刻

当前入口运行《王牌训练师》原版玩法。通过手动投篮培养球员，完成月度交付，并收集球星与器械图鉴。 [挂机改版设计参考](docs/初版游戏设计方案.md)

## 本地运行

```sh
npm ci
npm run dev
```

开发地址为 [127.0.0.1:5174](http://127.0.0.1:5174)。已有 `node_modules` 时可直接运行 `npm run dev`。运行 `npm run build` 后使用 `npm run preview` 查看生产构建，预览地址为 [127.0.0.1:4174](http://127.0.0.1:4174)。

常规回归使用 `npm test`，渲染回归使用 `npm exec -- vitest run --config vitest.renderer.config.ts`。

## 项目配置

本地复刻使用本地美术和浏览器存档。平台配置与技能以项目内的 `hupu-ai-game-skills` 为准。
