# smoke/auth-user

## 这是什么

哨兵用例（`sentinel/`），不对应任何历史 bug。它断言的是"这套 harness 在这个
revision 上是可信的"：注入成功、Nest app 起得来、seed 用户登录态有效、checkpoint
和 verdict 映射都工作。

对比表里如果某一列的哨兵是 💥 或 ❌，那一列的其余格子一概不要相信。

## 复现步骤

`GET /api/auth/user`（`USER_ME`），带 seed 用户的会话 cookie。

## 期望行为（checkpoint 断言）

- 返回 200
- 返回体的 `id` 和 `email` 与 e2e seed 用户（`test@e2e.com`）一致

## 期望状态

`status: fixed` —— 正确行为必须成立，任何 revision 上复现失败都判 regression。
