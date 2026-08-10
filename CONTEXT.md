# 术语

这套术语的目的是让人、agent 和报告说同一种话。歧义最贵的地方是"通过"到底指什么，
所以 Verdict、Check、Acceptance 三个词必须严格区分。

每条给出定义，以及**不要用**的说法——不是文风洁癖，是这些近义词会在讨论里悄悄
改变结论。

**Case（用例）**
一个被测场景的完整声明：一个 runner、一份配置、一组期望。纯数据，没有自己的行为。
_不要用_：test、script、脚本

**Runner**
一族用例共享的执行实现，分 seed / execute / verify / cleanup 四个阶段。
_不要用_：executor、driver、handler

**Group（分组）**
用例 id 里斜杠前的那一段，对应 `cases/` 下的一层目录，也是 CLI 过滤的单位。
_不要用_：suite、scope、folder

**Fixture**
seed 阶段建出来、execute 阶段依赖的状态（space、base、table、字段、行）。
_不要用_：test data、种子数据、环境

**Expectation（期望）**
用例声明的、从外部可见的正确结果。写在用例配置或 runner 的 verify 里。
_不要用_：assertion、断言语句

**Check**
一条期望的执行结果：名字、期望值、实际值、通过与否、严重级别。是数据，不是异常。
_不要用_：assert、log、错误

**Blocking / Warning**
Check 的两个级别。blocking 决定 verdict；warning 只出现在报告里，永远不把运行判红。
清理失败是典型的 warning——产品没错，是测试自己的家务事没做干净。
_不要用_：error/info、严重/轻微

**Verdict（判定）**
框架对一个用例算出的确定性结论：`pass` / `fail` / `skipped`。由 checks 推导，
不由人解释。
_不要用_：结果、状态、结论

**Case Error**
用例自身没能跑完（网络断了、fixture 建不起来、runner 有 bug），区别于"期望没满足"。
两者在 artifact 里是不同字段。
_不要用_：failure、报错

**Evidence（证据）**
解释判定的结构化事实：资源 id、行数、抽样行、每个阶段耗时、完整请求链。
_不要用_：日志、输出、debug 信息

**Artifact（结果文件）**
一个用例在一次运行里产出的那份 JSON。无论通过、失败还是崩溃都会写。
_不要用_：报告、log 文件

**Acceptance（验收）**
从**计划**出发对一整轮运行的 fail-closed 判定：每个计划内用例是否都产出了恰好一条
能解释的结果。它比"有没有红"严格。
_不要用_：通过率、成功率

**Skip（跳过）**
用例主动声明的、有理由的不执行。没有理由的跳过会让整轮验收被拒。
_不要用_：忽略、跳过失败

**Target（被测环境）**
这一轮验收所指向的 Teable 部署，由镜像 tag 或 endpoint 确定。
_不要用_：环境、实例、服务器

**Session（会话）**
对被测环境认证后的凭据。本地由 `lab up` 自动签入并缓存。
_不要用_：token、账号

**Run（运行）**
一次 `lab run` 的执行，有唯一 run id，对应 `artifacts/<run-id>/` 一个目录。
_不要用_：批次、任务
