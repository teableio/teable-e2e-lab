---
owner: qa
tags:
  - smoke
  - auth
enabled: true
---

# smoke/auth-user

## Goal

确认这一轮验收所用的会话是真实可用的：能通过公共 API 读回自己的身份。它是所有
其它用例的前置条件——会话失效时，后面每个用例都会以互相矛盾的方式失败，先在这里
一次性暴露出来。

## Seed Phase

无。这个用例不建任何数据。

## Execute Phase

以当前会话 `GET /api/auth/user/me`。

## Expectations

- `http.status` 为 200。
- 响应体含 `id`（只断言存在，不断言具体值——用户 id 每次起环境都不同）。
- 响应体 `email` 等于 `framework.environment.LAB_EMAIL`，证明拿到的是本轮签入的
  那个账号，而不是某个残留会话。

## Cleanup

无。

## Notes

`email` 的期望值直接引用 `LAB_EMAIL` 常量而不是写死字符串：改签入账号时只有一处
需要改，用例不会悄悄失配。
