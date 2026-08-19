# Agent Guide

这个仓库是 **e2e-lab**：Teable 的 bug 回归对比系统。传入一批 teable-ee commit，
对每个 commit 跑同一批 bug 用例，输出 bug × commit 对比表，一眼看出某个 bug 在
哪两个版本之间被修掉、或在哪两个版本之间回归。

骨架移植自 teable-perf-lab（注入模型、case/runner/registry 三层、artifact 先落盘、
fail-closed 验收），判定层是本仓库自己的：观察 vs 声明 vs gating 列。先读
[README.md](README.md) 拿全貌；加改用例读 [.agents/README.md](.agents/README.md)；
流水线细节读 [docs/operations/e2e-lab.md](docs/operations/e2e-lab.md)。

## Working Rules

- 改动限制在本仓库内，除非用户明确要求动别的 checkout。`teable-ee` 只是运行时
  宿主，不为 e2e-lab 的事改它、提交它。
- 用例定义在 `cases/**/*.case.ts`，每个必须有同名 `.md`，必须注册进 `registry.ts`。
- 共享执行逻辑属于 `framework/`，用例文件里不写逻辑。
- 数据保持确定性，期望值本地推导，让重跑逐字节可比。
- 断言只走公共 API 的真实读路径；框架没有数据库连接。

## 这几件事看起来像疏漏，其实是设计

改之前先问，别顺手"修好"：

- **status: fixed 的用例跑在老 commit 上复现了 bug 不判红。** 那是修复之前的
  历史事实，只有最新的 gating 列上的复现才是回归。判定表在
  `framework/verdict.ts`，一屏读完。
- **意外修复（open 的 bug 突然不复现）只提醒不卡红。** 为好消息判红会教人不验证
  就改 status，元数据就烂了。
- **error（用例没跑成）在任何列都判红。** 一个跑不成的用例产出的是零观察，把它
  当「符合预期」会让坏掉的 harness 永远冒充一个稳定的 bug。
- **缺一格结果整个 run 判红（fail-closed）。** 空格子会被读表的人当成绿。
- **acceptance.yml 是兼容垫片，不能直接删。** teable-enterprise 的发布流水线按
  文件名派发它，见 [docs/dispatching.md](docs/dispatching.md)；退役它要先在
  teable-enterprise 走 PR。
- **checkpoint 里抛什么都算 bug 复现，包括 500。** 有些 bug 的形态就是接口 500；
  区分「bug 在」和「用例坏了」的是 checkpoint 边界，不是异常类型。

## Verification

改完先跑静态链：

```bash
pnpm check
```

本地运行时验证见 [.agents/skills/localrun/SKILL.md](.agents/skills/localrun/SKILL.md)；
`pnpm check` 不构成运行时验收，GitHub Actions 才是验收面。

## 公开仓库纪律

- 安全类 bug 修复发布前不收录（详见 CONTRIBUTING.md）。
- 用例和文档里不出现内部 URL、客户数据、任何凭据。唯一的 secret 是 CI 的
  teable-ee 只读访问 token（`TEABLE_EE_CHECKOUT_TOKEN`），只活在 GitHub secret 里。
