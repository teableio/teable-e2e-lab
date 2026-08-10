---
owner: qa
tags:
  - record
  - bulk-create
  - mixed-fields
enabled: true
---

# record/create-100-mixed

## Goal

覆盖批量写入这条最常用的写路径：一次请求创建 100 条记录，四种字段类型各写一列，
然后逐行证明落库的值和请求发出去的值完全一致。它要抓的回归是"接口返回 200 但数据
不对"——少写了行、类型转换出错、空值语义变了。

## Seed Phase

新建独立的 space → base → table，字段为 `Title`(singleLineText)、
`Description`(longText)、`Score`(number)、`Active`(checkbox)。建表时显式传
`records: []`，并在 seed 结束前全量扫描确认表为空。

这一步的隔离是刻意的：每个用例自己造 space，跑完整个删掉，所以用例之间不共享任何
状态，可以并发跑，也可以随便做破坏性操作。

## Execute Phase

按 `batch_size`（默认 1000，此用例一批装得下）分批 `POST /api/table/{tableId}/record`，
`fieldKeyType` 用 `name`。每行的值由行号推导，见下。

批次返回非 2xx 时**不抛异常**，记录状态码后继续进入 verify——"100 条里落了几条"
是排查这类失败时最有用的事实。

## Expectations

- `create.all_batches_accepted`：所有批次都是 2xx。
- `create.returned_ids`：返回的记录 id 数等于 100。
- `scan.record_count`：通过公共读接口分页全量扫描，行数等于 100。
- `scan.cell_values_match`：每一行每一列的值都等于本地推导的期望值，不匹配的行
  最多列出前 10 条。

## Data Determinism

值是行号的纯函数（`framework/runners/record_create.py` 的 `expected_cell`）：

| 类型 | 第 N 行的值 |
|---|---|
| singleLineText | `{字段名}-{N}` |
| longText | `{字段名} row {N}\nline two` |
| number | `float(N)` |
| checkbox | N 为偶数时 `True`，奇数时**不写这个字段** |

同一个函数既用来构造请求、又用来算期望值，所以两边不可能对不上。不用快照、不用
黄金文件，重跑逐字节可比。

## Cleanup

删除 seed 建的 space（连带 base 和 table）。清理失败会记成 warning，不影响判定
——清理是测试自己的家务事，产品没有因此出错。

## Notes

checkbox 的空值语义是这个用例特意要盯的：Teable 里未勾选存的是"字段缺失"而不是
`false`，所以奇数行的期望是"没有这个键"。这个语义变过一次，值得有用例守着。
