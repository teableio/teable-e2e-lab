---
owner: qa
tags:
  - record
  - bulk-update
  - mixed-fields
enabled: true
---

# record/update-100-mixed

## Goal

覆盖批量更新这条写路径：100 行已有记录，分四批把每一行的**每一个字段**改成新值，
然后逐格证明改的都落了。

它要抓的回归是**"更新只落了一部分"**——接口返回 200，行数一个没少，抽样还可能正好
抽到改对了的那几行，但实际有一批或某一列没跟上。这类故障用状态码、用行数、用抽样
都看不见，只有全量逐格比对能看见。

## Seed Phase

新建独立的 space → base → table，字段与 [create-100-mixed](create-100-mixed.md)
完全相同：`Title`(singleLineText)、`Description`(longText)、`Score`(number)、
`Active`(checkbox)。建表显式传 `records: []` 并扫描确认为空。

然后按 **revision 1** 建 100 行——和 create 用例逐字节相同的那 100 行，走的是同一个
`create_rows()`。

seed 结束前做一次全量扫描，逐格证明 100 行确实**都停在 revision 1**。这一步不是
形式主义：这个用例的所有结论都建立在"行的初始值不等于目标值"上，如果行一开始就已经
是目标值，一个完全坏掉的更新也能扫得干干净净。扫描顺序同时用来建立**行号 → record
id** 的映射，让 execute 能精确打到第 N 行。

seed 不满足任何一条就抛异常——那是"用例没跑成"，不是"产品错了"。

## Execute Phase

按 `update_batch_size`（此用例 25，即 4 批）`PATCH /api/table/{tableId}/record`，
body 是 `{fieldKeyType: "name", records: [{id, fields}]}`，把每行改成 **revision 2**。

批次返回非 2xx **不抛异常**，记录状态码后继续进入 verify——"100 行里改了几行"是排查
这类失败时最有用的事实。

## Expectations

三层，逐条说明在证明什么：

**响应层**

- `update.all_batches_accepted`：四批全是 2xx。
- `update.echoed_record_count`：四批响应回声的记录数合计等于 100。这条不是凑数——
  实测这个接口对**不认识的 record id 不报错，而是从返回数组里悄悄剔掉**（1001 个假
  id 得到的是 `200 []`；3 真 1 假的批次返回 200 和 3 条）。所以"响应里回来了几条"
  比状态码早一步暴露"服务端跳过了行"。

**最终状态层**（重点）

- `scan.cell_values_match`：分页全量扫描，每一行每一列都等于本地按 revision 2 推导
  的期望值，不匹配最多列前 10 条（行号 + 字段名 + 期望 + 实际）。这是唯一能抓到
  "只落了一部分"的断言。
- `scan.rows_left_at_seed_revision`：整行仍然完全等于 revision 1 的行数为 0。它回答
  上一条因为截断而回答不了的问题——"3 行没更新"和"100 行全没更新"在前 10 条列表里
  长得一模一样，只有这条能把它们分开；它也把"没更新"和"更新成了错的值"分成两种诊断。

**副作用层**

- `scan.record_count`：仍然是 100。更新不该增行，也不该删行。
- `scan.record_ids_unchanged`：扫描顺序上的 record id 与 seed 记下的完全一致。证明
  更新是**原地改**而不是删了重建；顺序若漂移，行号到值的映射本身就不成立了。

## Data Determinism

值是 **(行号, revision)** 的纯函数，公式在
[`framework/runners/record_create.py`](../../framework/runners/record_create.py)
的 `expected_cell`，两个用例共用：

| 类型 | revision 1（seed） | revision 2（update 后） |
|---|---|---|
| singleLineText | `Title-7` | `Title-7-r2` |
| longText | `Description row 7\nline two` | `Description row 7-r2\nline two` |
| number | `float(7 × 1)` = `7.0` | `float(7 × 2)` = `14.0` |
| checkbox | 偶数行 `True`，奇数行空 | **奇偶反转**：奇数行 `True`，偶数行空 |

revision 1 就是 create 用例今天在断言的那组值，一个字节没动。

这里有一条**承重的性质**：对任意一行的任意一格，revision 1 的值都不等于 revision 2
的值。少了它，"这一行没被更新"在那一格上就是隐形的——checkbox 尤其明显，如果奇偶不
反转，半数行改与不改看起来一样。这条性质由单测 `test_no_cell_survives_a_revision_bump`
守着，不是靠读代码相信。

## Cleanup

删除 seed 建的 space（连带 base 和 table）。清理失败记成 warning，不影响判定
——清理是测试自己的家务事，产品没有因此出错。

## Notes

**写显式 null，读回来是没有这个键。** 这是本用例特意盯住的语义，两半都在真实实例上
实测过：

- PATCH body 里**省略**一个字段，那一格保持原值；要把 checkbox 从勾上改成不勾，必须
  显式传 `null`（`false` 也行）把它点名清掉。
- 清掉之后走读接口，那一格是**整个键不存在**，不是 `false` 也不是 `null`。

所以请求形状和期望形状是不对称的：payload 由 `update_payload_row()` 生成（每个字段
都写），期望值由 `expected_row()` 生成（空格子不出现）。verify 里为此专门补了一个
反向比对——扫描结果里出现了期望值中不存在的键，同样计入 `scan.cell_values_match`。
只比对期望里有的键，会漏掉"该清空的格子没被清空"这一整类故障。

**这个接口的返回形状和创建不一样**：创建是 `201` + `{"records": [...]}`，更新是
`200` + 顶层数组。
