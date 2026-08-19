# filter/scalar-lookup-none-of-loads

## Bug 来源

T6571。app.teable.cn 的一张 Customer 表**整个打不开**，页面报：

```
Socket Error
internal_server_error: Failed to load table records:
error: COALESCE types text and jsonb cannot be matched
```

修复：[teable-ee d45bf6f32](https://github.com/teableio/teable-ee/commit/d45bf6f32) /
PR #2865。

根因：标量 lookup（lookup 的目标是单选这类单值字段）在库里存成普通标量，但筛选路径按
「多值 lookup 的 JSON 数组」去编译它，`isNoneOf` 于是拼出一个 text 和 jsonb 相比的
COALESCE，Postgres 直接拒绝。用户看不到任何筛选报错——**表就是不出数**。

## 夹具形状

```
Reference 表            Host 表
─────────────           ──────────────────────────────
Reference (文本)   ←──  Reference (link, manyOne)
Category (单选)    ←──  Reference Category (lookup, 标量)
```

Reference 表每个分类一行，行名就叫分类名，这样从 link 一眼就能看出某行属于哪个分类，读
报告不用再查一次映射。

Host 表 4 行：`Allowed` / `Excluded A` / `Excluded B` 各一行，外加一行**什么都没链**。
最后这行是必须的——它是「筛选太狠」和「筛选坏了」的分界：`isNotEmpty` 那半必须把它去掉，
而 `isNoneOf` 那半不该碰它。

保存的视图对**同一个 lookup 字段**同时做三件事：

| 用法 | 条件                                                   |
| ---- | ------------------------------------------------------ |
| 筛选 | `isNotEmpty` + `isNoneOf ["Excluded A", "Excluded B"]` |
| 排序 | lookup 升序，再按 `Task` 升序                          |
| 分组 | 按 lookup 升序                                         |

三者是同一个表达式的三个独立消费者，线上出问题的那个视图三样都有。

`excludedCategories` 声明了**两个**分类不是凑数：单元素的 `isNoneOf` 有可能被编译成一个
等值判断，绕开出问题的数组路径。

## 阶段与判定边界

**setup（失败 = 💥 error）**：建两张表、建 link、建 lookup、种 4 行，然后**不带视图**读一
次，断言 4 行都在、且每个有链接的行 lookup 已经算出正确的分类值。故障是「视图加载不出
来」，如果连普通读都读不出来，那是另一回事，该判 💥 而不是误判成本 bug。

**checkpoint `saved-lookup-view-loads`（失败 = ❌ bug 复现）**：存 filter / sort / group，
然后按 viewId 取数，断言正好回来 `["allowed-task"]`。

这一步有两种失败形态，checkpoint 都算复现：500（bug 的原始形态，`bugCheckpoint` 会把抛出
的异常直接算作复现），以及视图能加载但行选错了——后者更安静，只有比对行列表才看得见。

## 关于 v2

这个故障只存在于 v2 的记录查询路径上。lab 的 harness **默认不走 v2**——不加声明的话，
请求会被 v1 服务，而 v1 从来没有这个 bug，用例在每一列都是绿的、什么都没证明。这不是
假设：这条用例第一版就是这么绿着过了自己的修复前 commit。

所以用例声明 `routing: "force-v2"`，并在 setup 里用 `assertV2Routing()` 读响应头
`x-teable-v2` 证明确实走了 v2。两半缺一不可，理由写在 `framework/v2-routing.ts`。

## 期望状态

`status: fixed`。修复已在 develop 上（d45bf6f32），此后再复现就是回归。
