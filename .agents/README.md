# 用例作业流程

加一个 bug 用例的完整回路。这里是唯一的流程来源，别处不要复述。

## 1. 先想清楚三件事

- **这个 bug 用什么 API 序列复现？** 观察一律走公共 API 的真实读写路径——用户是通过
  API 用产品的，绕过 API 会漏掉缓存、序列化、权限过滤这些最容易错的层。**搭夹具**可以
  直接写库（`framework/fixture-db.ts`），用来造 API 造不出来的历史状态：漂移的存储快照、
  和物理列对不上的字段元数据、被早已下线的路径清空的外键。这条边界是被强制的——在
  `bugCheckpoint()` 里面拿数据库句柄会抛错。
- **请求确实走到 v2 了吗？** 产品在往 v2 迁移，v1 的 bug 不再修，所以这里只有一个引擎、
  不是选项：每条用例守的都是 v2，用例不需要声明。但 v1 还在、还会应答，**悄悄退回 v1
  是这套 harness 最坏的故障**：用例问的是从来没有这个 bug 的那套代码，每一列都绿。
  所以 runner 要在 setup 里用 `assertServedByV2()` 自证，而且是**对用例真正依赖的那个
  请求的响应**断言，不是另发一个探针——探针走到了 v2、被测操作没走到，正是要抓的形状。
  连 feature 一起断言（`x-teable-v2-feature`）：bug 在 getRecords 里，"某个 v2 端点能用"
  说明不了任何事。setup 阶段失败判 💥，不会被误读成「bug 没了」。见
  `framework/engine.ts`。
- **checkpoint 在哪里？** `bugCheckpoint()` 里面抛出的任何异常都算「bug 复现」，
  外面抛的都算「用例没跑成」。setup（建表、造数、验证夹具就位）放外面，对 bug 的
  观察放里面。夹具验证放外面是有讲究的：结论都建立在初始状态正确上，夹具本身没
  就位时判 error 而不是误判成 bug。
- **status 是什么？** bug 还没修就是 `open`（复现是预期，不红）；已修就是
  `fixed`（复现即回归，在 gating 列判红）。哨兵用例（守护当前正确行为、不对应
  历史 bug）用 `issue: "sentinel/<name>"` + `status: "fixed"`。

## 2. 写文件

- 用例：`cases/<组>/<名字>.case.ts`，`id` 必须等于 `<组>/<名字>`（check 会验）。
  `id`、`issue`、`status` 必须是字符串字面量——计划器和检查靠静态解析读它们。
- 文档：同目录同名 `.md`，写清楚 bug 来源（issue 链接）、复现步骤、checkpoint
  断言什么、数据为什么这样造。半年后没人记得 T1481 是什么，文档是给那时候的人看的。
- 注册：`registry.ts` 里 import 并加进 `cases` 数组。
- 执行逻辑属于 `framework/runners/`，用例文件里不写逻辑。现有 runner 覆盖不了时
  新开一个 runner kind：`framework/types.ts` 加 config 接口和
  `BugCaseConfigByRunner` 条目、`framework/runner-registry.ts` 加实现——漏任何
  一步 `pnpm check:types` 会拦。

## 3. 数据规则

- 数据保持确定性：期望值是 (行号, revision) 之类的纯函数，本地推导，让重跑
  逐字节可比。共享公式放 `framework/runners/` 并配 `.test.js` 守住承重性质
  （参考 `record-values.test.js` 的 no-cell-survives 测试）。
- 夹具在用例内自建自清理（表名带 runId 防撞）；cleanup 失败只记 warning——那是
  测试自己的家务事，产品没错。

## 4. 验证

```bash
pnpm check                 # 静态链，PR 的必要条件
# 本地跑通（方向性验证）：见 .agents/skills/localrun/SKILL.md
# 验收：dispatch e2e-lab.yml，GitHub Actions 是验收面
```

## 5. 安全边界

公开仓库。安全类 bug（越权、注入、认证绕过等）在修复发布之前**不进这个仓库**
——一个 `status: open` 的用例就是一份公开可运行的漏洞复现。修复发布后以
`status: fixed` 收录。规则在 CONTRIBUTING.md，别绕。
