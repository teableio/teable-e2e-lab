# link/required-link-keeps-sibling-refresh

## Bug 来源

T6861「计算刷新将必填 manyOne 展示列写 NULL 致死信」。线上现场：app.teable.ai 的一个计算
任务，某行必填关联的外键（`__fk_*`）已经是空的，展示列还留着旧 JSON；被关联表一更新，
同一步要刷新两个关联字段，生成的 SQL 在 FK 为空时走 ELSE 分支，把 NULL 写进必填展示列，
Postgres 报 23502，任务以 `data_constraint` 进死信——**管理端拒绝重放这一类**，只能人工处理。

修复：[teable-ee 1fc507346](https://github.com/teableio/teable-ee/commit/1fc507346) /
PR #3088。根因是 `UpdateFromSelectBuilder` 对必填 link 的 COALESCE 只覆盖了「FK 非空但
join 没命中」，FK 本身为空时故意传播 NULL。

## 用例盯的是那个无辜的字段

这条用例最重要的一个决定：**断言的不是必填关联，而是同批刷新的那个多选关联**。

因为一条 UPDATE 是一个整体。必填展示列被写 NULL 导致整条语句失败，于是**多选关联那个
本身完全没问题的字段，也永远刷不到新值**。用户丢的是这个。盯必填关联只能看到"它还在"，
盯多选关联才能看到"整批刷新死了"。

同时也断言必填关联没被清空——一个靠把它写空来"成功"的实现是另一个 bug，该红而不是悄悄绿。

## 夹具

```
Foreign 表                     Host 表
──────────────                 ─────────────────────────────────────
Name = "linked-title"    ←──   Required Link (manyOne, notNull, 单向)
Name = "other-title"     ←──   Many Links   (manyMany, 单向)
```

Host 一行：必填关联指向 linked，多选关联指向 [linked, other]。

多选关联放**两行**而不是一行：只放一行的话，「整个字段没刷新」和「这一项没刷新」在断言上
分不开。

必填关联在**建行之前**建：把关联设成必填，只有在还没有行可能违反它的时候才会被接受。

### 为什么要写数据库

「FK 已空、展示列还在」是**残骸**，不是产品会应要求产生的状态——它是某条更早的写入路径
留下的。API 造不出来，所以用 `framework/fixture-db.ts` 直接清掉那一列。

FK 列是**按模式找**的（`__fk\_%`），不是写死列名：`__fk_<fieldId>` 是内部命名细节，写死
了哪天它变了，用例会以一个和这个 bug 毫无关系的理由失败。

观察全部走公共 API：就是用户那一行，按表格读它的方式读。

## 阶段与判定边界

**setup（失败 = 💥 error）**：建表、建两个关联字段、建行，读一次并断言 v2 应答
（`x-teable-v2-feature=getRecords`）、必填关联在位、多选关联正好两项。然后清 FK，断言正好
影响 1 行。这些全在 checkpoint 外面——夹具没搭起来时该判 💥，不是误判成 bug。

**checkpoint `sibling-link-refresh-survives-cleared-fk`（失败 = ❌ bug 复现）**：改 foreign
表里 other 那行的名字触发重算，然后轮询 host 行，直到多选关联里 other 那项的标题变成新值。
超时即复现——因为写请求返回 200、失败发生在计算管道里，用户侧唯一的信号就是"值永远不来"。

超时（30s）就是断言本身：太短会把慢但正常的管道判成 bug。

## 期望状态

`status: fixed`。修复已在 develop 上（1fc507346），此后再复现就是回归。
