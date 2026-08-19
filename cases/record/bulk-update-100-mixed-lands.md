# record/bulk-update-100-mixed-lands

移植自 teable-api-lab 的 `record/update-100-mixed`，那份设计的完整论证保留在下面。

## 目标

覆盖批量更新这条写路径：100 行已有记录，分四批把每一行的**每一个字段**改成新值，
然后逐格证明改的都落了。

它要抓的回归是**「更新只落了一部分」**——接口返回 200，行数一个没少，抽样还可能
正好抽到改对了的那几行，但实际有一批或某一列没跟上。这类故障用状态码、用行数、
用抽样都看不见，只有全量逐格比对能看见。

## 阶段与判定边界

checkpoint 之前的任何失败都是 💥 error（用例没跑成），checkpoint 内的失败才是
bug 复现：

**setup（失败 = error）**：在 seed base 里建独立表（四种字段：singleLineText /
longText / number / checkbox），显式传 `records: []`；按 revision 1 建 100 行；
全量扫描逐格证明 100 行**都停在 revision 1**。这一步不是形式主义——所有结论都
建立在「行的初始值不等于目标值」上，如果行一开始就是目标值，一个完全坏掉的更新
也能扫得干干净净。扫描顺序同时建立行号 → record id 的映射。

**操作（失败被记录，不抛）**：按 `batchSize=25` 分四批 `updateRecords` 把每行改成
revision 2。批次非 2xx 不抛异常，记下状态码继续——「100 行里改了几行」是排查这类
失败时最有用的事实。

**checkpoint `every-cell-landed`（失败 = bug 复现）**：

- 四批全部 2xx；
- 四批响应回声的记录数合计等于 100——实测这个接口对不认识的 record id 不报错，
  而是从返回数组里悄悄剔掉，所以「响应里回来了几条」比状态码早一步暴露服务端
  跳过了行；
- 全量扫描：每一行每一列等于按 revision 2 本地推导的期望值（不匹配最多列前 10 条）；
- 整行仍停在 revision 1 的行数为 0——它回答截断列表回答不了的问题：「3 行没更新」
  和「100 行全没更新」在前 10 条里长得一模一样；
- 行数仍为 100；record id 顺序与 seed 记录的完全一致——证明更新是原地改而不是
  删了重建。

## 数据确定性

值是 (行号, revision) 的纯函数，公式在
[`framework/runners/record-values.ts`](../../framework/runners/record-values.ts)：

| 类型           | revision 1（seed）            | revision 2（update 后）          |
| -------------- | ----------------------------- | -------------------------------- |
| singleLineText | `Title-7`                     | `Title-7-r2`                     |
| longText       | `Description row 7\nline two` | `Description row 7-r2\nline two` |
| number         | `7 × 1`                       | `7 × 2`                          |
| checkbox       | 偶数行 `true`，奇数行空       | **奇偶反转**                     |

承重性质：对任意一行的任意一格，revision 1 ≠ revision 2。少了它，「这一行没被
更新」在那一格上就是隐形的。由 `record-values.test.js` 的
`no cell survives a revision bump` 守着，不是靠读代码相信。

**写显式 null，读回来是没有这个键**：PATCH body 里省略字段则保持原值，清空
checkbox 必须显式传 `null`；清掉之后读回来整个键不存在。所以请求形状
（`updatePayloadRow`，每个字段都写）和期望形状（`expectedRow`，空格子不出现）
不对称，且比对是双向的——扫描结果里出现期望中不存在的键同样算不匹配，否则会漏掉
「该清空的格子没被清空」这一整类故障。

## 清理

finally 删除建出来的表；清理失败只记 warning——那是测试自己的家务事，产品没错。

## 期望状态

`status: fixed`（哨兵语义）：这条写路径在任何被测 revision 上都必须正确。
