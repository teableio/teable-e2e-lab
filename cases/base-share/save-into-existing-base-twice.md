# base-share/save-into-existing-base-twice

## Bug 来源

T6840。用户从分享页把一个 App 转存到**已有的 Base**（`Save to my space` →
`Existing base`），点完 `Duplicate` 页面提示成功，打开目标 Base 却什么都没看到；再转存
一次，直接弹 `Internal server error`。

修复：[teable-ee 3b1bfd0d7](https://github.com/teableio/teable-ee/commit/3b1bfd0d7) /
PR #3071。

同一个用户动作下面压着两个独立故障，用例把它们放在一个 checkpoint 里，因为对用户来说
它们是同一件事没做成：

1. **第二次转存 500。** v2 的转存路径 `createFoldersV2` 直接按原名 insert 文件夹，
   撞上 `base_node_folder (base_id, name)` 唯一索引。v1 那条路径早就用 `getUniqName`
   去重了，v2 漏了。
2. **第一次转存看不见。** v2 转存用裸 SQL 写 `base_node` 行，不发任何 per-resource
   事件，目标 Base 的节点列表缓存于是一直是转存前那份——直到有别的节点变更顺手把缓存
   冲掉。修复给 `BaseNodeListener` 加了 `BASE_SHARE_COPY_COMPLETE` 监听。

## 夹具为什么只分享一个文件夹，不带表

第 2 个故障是被缓存藏起来的，而**建表会发 `TABLE_CREATE` 事件，顺手把同一份缓存冲掉**。
分享里只要带一张表，"转存成功但不可见"就永远观察不到——用例会在有 bug 的版本上照样绿。
所以夹具是一个空文件夹、一张表都没有：这份缓存要么被转存路径自己冲掉，要么没人冲。

这也正是线上现场的形状——用户转存的是**文件夹里的一个 App**，不是表。

## 阶段与判定边界

**setup（失败 = 💥 error）**

1. 在种子 space 里建一个源 Base，建一个名为 `Shared Folder` 的文件夹节点；
2. 对这个文件夹建分享，并 `allowSave: true`——转存进别人的 Base 默认是关的，不打开的话
   每次转存都是 403，用例根本问不到它要问的问题；
3. 再建一个目标 Base。

**夹具校验（失败 = 💥 error）**：读一次目标 Base 的节点列表，断言里面还没有任何叫
`Shared Folder*` 的文件夹。这一步同时干两件事——证明初始状态干净（否则"转存的文件夹出现
了"无从判断），并且**把节点列表缓存热起来**：忘记冲缓存的转存路径能继续拿来糊弄人的，
就是这一份。

**checkpoint `repeated-save-into-same-base-lands`（失败 = ❌ bug 复现）**

- 用同一个 shareId、同一个 `baseId` 连续转存 2 次，每次都必须是 200。两次的结果是**先
  收集再判定**，不是遇到第一个坏的就抛：failed 在第几次、什么状态码，是这类故障最有用的
  事实，先抛就把后面的序列丢了。
- 然后**轮询**目标 Base 的节点列表，直到文件夹名正好是 `["Shared Folder", "Shared
Folder 2"]`。缓存冲刷发生在转存响应之后，读一次会误判；轮询超时（15s）就是"转存说它
  成功了、Base 看上去没变"这个用户视角故障的判定形式。

checkpoint 里抛的任何东西——500、断言不过、轮询超时——都算 bug 复现。setup 和夹具校验
放在外面，是为了让老版本上"分享 API 还不长这样"之类的问题判 💥 而不是误判成这个 bug。

## 期望名字为什么是 "Shared Folder 2"

`getUniqName`（`@teable/core`）的规则：名字没被占就原样用，占了就从 2 开始往后找第一个
空位，拼成 `<名字> <n>`。所以 N 次转存的期望是 `名字, 名字 2, ..., 名字 N`。用例里
`expectedFolderNames` 就是这条规则的复刻，`saveCount` 调大也仍然成立。

断言比对的是**排序后的名字集合**，不是某一个名字存在——"两次转存只落了一次"和"第二次
覆盖了第一次"在"存在 Shared Folder 2"这种断言下长得一样。

## 数据确定性

两个 Base 的名字都带 runId 防撞；文件夹名是固定字面量，因为期望值就是它的函数。转存
`withRecords: false`——这个 bug 与记录内容无关，带记录只会让用例更慢更脆。

## 清理

finally 里按 target → source 的顺序 `permanentDeleteBase`，清理失败只记 warning——那是
测试自己的家务事，产品没错。

## 期望状态

`status: fixed`。修复已合入 develop（3b1bfd0d7，2026-08-19），此后再复现就是回归，在
gating 列判红。
