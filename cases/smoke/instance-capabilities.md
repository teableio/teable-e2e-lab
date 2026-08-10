---
owner: qa
tags:
  - smoke
  - licensing
  - guardrail
enabled: true
---

# smoke/instance-capabilities

## Goal

守住"我们究竟被允许测什么"这条线。被测实例的可用能力取决于它的授权档位，默认档位
下一部分高级能力是关闭的。

这个用例要抓的不是产品缺陷，是**验收本身的失效**——环境悄悄降档、或者悄悄升档，
都会让其它用例的结论变得没有意义。一个"测高级权限"的用例，跑在这项能力压根没开启
的实例上，跑绿也什么都没证明。

## Seed Phase

无。

## Execute Phase

`GET /api/instance/usage`。

## Expectations

- `level` 等于 `free`。降档或升档都会红。
- 四项企业能力断言为**关闭**：`advancedPermissionsEnable`、`appEnable`、
  `automationEnable`、`fieldAIEnable`。这是刻意反向断言的——将来注入 license 后
  这个用例会红，提醒人去更新"允许测什么"的清单，而不是让覆盖面悄悄变化。
- 两项数值限制为 `-1`（无限）：`maxRows`、`apiRateLimit`。核心功能的大数据量用例
  依赖这一点，被限流了要在这里一次性暴露，而不是让下游用例莫名其妙超时。

## Cleanup

无。

## Notes

档位变化时要改两处，且必须在同一个改动里：

1. 这个用例的 `expect_fields`（改 `level`，翻开新授权的能力）；
2. 环境侧的授权配置（走环境变量传入，**不要写进仓库**）。

只改其中一处，这个用例就会红——这正是它存在的意义。

当前实例开了哪些能力，不要凭记忆，直接问它：

```bash
curl -s http://127.0.0.1:3100/api/instance/usage | python3 -m json.tool
```

写新用例前先跑这一条，确认你要测的能力是开着的。对着一个关闭的能力写用例，是这套
验收里最浪费时间的一种做法。
