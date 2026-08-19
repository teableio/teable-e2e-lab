# formula/scalar-value-over-linked-text

## Bug 来源

T6844「单值数字公式引用 link/lookup 触发 jsonb 数组转 double 22P02」。公式
`VALUE({lookup})` 生成的计算 UPDATE 把 `jsonb_agg(...)` 直接包进 `::double precision`，
Postgres 对 `[0.0003]` 这种值报 22P02（invalid input syntax for type double precision）。

修复：[teable-ee 662cfde02](https://github.com/teableio/teable-ee/commit/662cfde02) /
PR #3075。同一批还有 [ca79dcb9c](https://github.com/teableio/teable-ee/commit/ca79dcb9c)
（T6845）把 22P02 归类为不可重试——因为重试一个语法错误只是在浪费时间。

## 用户看到的是什么：什么都没看到

这是这条用例的形状由来。故障发生在计算管道里：写请求返回 200，计算任务失败、重试、进
死信，**没有任何东西回到调用方**。用户看到的就是那一格永远是空的。

所以整条用例——包括观察——全走公共 API：像用户的表格那样等那个值，**值没等到就是 bug**。
不用读 `computed_update_dead_letter`，不用驱动内部队列。

这也意味着**超时就是断言本身**，不是随手写的一个数：太短会把「管道慢但正常」判成 bug，
足够长时才能保证只有「永远不来」会失败。这里给 30s，实测在 develop 上不到 1s 就落库。

## 夹具

```
Source 表                      Host 表
──────────────                 ────────────────────────────────
Title (单行文本) = "0.0003"  ←── Rates (link, oneMany)
                                Rate Titles (lookup of Title)
                                Conversion Rate (formula VALUE({lookup}))
```

三个决定都是承重的：

- **oneMany**，不是 manyOne——link 和它的 lookup 因此存成 **json 数组**，正是那次失败的
  cast 读不动的形状。
- **Title 是文本字段**，不是数字字段。值要以「json 数组里的文本」到达公式；换成数字字段
  就存成数字，用例问的就是另一件事了。
- **公式在行建好之后才建**，所以第一次计算是一次 backfill——线上报的就是 backfill 这条
  路径。

`sourceValue: "0.0003"` 取自线上报告。前导零的小数让故障可读：`[0.0003]` 是 Postgres
读不成 double 的字符串，而 `3` 这种值可能在某些坏 cast 下侥幸活下来，用例就失去分辨力。

## 阶段与判定边界

**setup（失败 = 💥 error）**：建两张表、link、lookup、formula，读一次 host 行，并对**这次
读的响应**断言 `x-teable-v2=true` 且 `x-teable-v2-feature=getRecords`。下面所有结论都是
「计算值来没来」，行本身不在、或者换了引擎应答，这个问题就无从问起。

**checkpoint `computed-value-arrives`（失败 = ❌ bug 复现）**：往 source 行**写回同一个
值**触发重算，然后轮询 host 行直到公式值等于 0.0003，超时即复现。

写回同一个值是有意的：这条用例问的不是「值变了没有」，而是「算得出来吗」；写回原值让期望
结果保持是个常量，用例不必跨着那次写去追踪它。

## 期望状态

`status: fixed`。修复已在 develop 上（662cfde02），此后再复现就是回归。

Issues 表里 T6844 当时还挂在「Entered development workflow」，但判断 `bug.status` 看的是
代码现状而不是流程标签——修复已经合进 develop，所以是 `fixed`。
