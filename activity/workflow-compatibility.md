# 技能工具兼容性记录

本项目沿用已有Vite游戏，技能包位于hupu-skills/，实际发布产物位于根h5/。未修改交付技能源码或state/*.json。

- 官方scan-skill-usage工具按cwd下skills/和index.html字面调用扫描；黑盒验证不能识别当前嵌套技能目录、外链bundle、可选链和别名。未把其空结果当作通过。
- 按技能使用文档允许的手写方式，h5/index.html内嵌11项真实运行能力；每项由当前源码调用和官方JS Path核对。没有加入dummy调用。
- state.py已记录需求、设计选择、正式启用授权、activity-api/postgresql路线及实现自检；current仍将根目录下不存在的skills/误判为“未交付技能”。未手动改状态文件、未改写这项结果为通过。
- 发布安全采用官方review-h5.py调用正式同源包校验API。原始结果passed/submissionAllowed=true、findings为空，证据activity/security-review-api.json；审核ZIP223个文件与实际h5逐项SHA一致。随后经官方固定入口上传临时预览进行实际页面验收。
- 官方CloudBase MCP在Windows上存在zipFile参数错配及直接Base64大小上限问题。本次保留原npm包、鉴权和部署API，只对本地stdio衍生工具的压缩输入做固定应用／函数／ZIP SHA守卫，原SDK上传已审ZIP原字节，保留0755。证据outputs/home-timeflow-20261117/cloudbase-mcp-audit/zip-compat-review.json。

本记录是工具兼容性说明，不是另行的安全放行、自造状态机或平台人工审核结果。项目实际部署与验收以公开manifest和原始API证据为准。
