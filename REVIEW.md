# 项目导读（给第一次看这个仓库的人）

十分钟看完，判断这套组织方式对不对。不需要读代码实现。

## 这是什么

Teable 接口功能验收。框架思想来自 `teable-perf-lab`——同一套纪律，不同目标：
perf-lab 追求**可比性**（同一个操作跨版本的耗时能不能比），这里追求**覆盖度和
可诊断性**（功能对不对，错了能不能立刻定位）。

一句话概括设计：**用例是数据，执行是共享 runner，结果是可解释的证据。**

## 十分钟怎么看

| 顺序 | 看什么 | 想回答的问题 |
|---|---|---|
| 1 | [README.md](README.md) 的"执行模型"和"Hard Rules" | 设计取舍是什么 |
| 2 | [cases/record/create-100-mixed.case.py](cases/record/create-100-mixed.case.py) | 加一个用例的成本有多低 |
| 3 | 同名的 [.md](cases/record/create-100-mixed.md) | 用例的意图是否说得清 |
| 4 | 本文"怎么证明它真在断言"一节 | 这套断言是不是摆设 |

## 三个关键决策

### 1. 被测环境用 Docker 起一次性实例，不打 staging

`docker/compose.yaml` 起一整套（Teable + Postgres + Redis），跑完 `down -v` 清空。

- **换来**：每次全新无脏数据、可以做破坏性用例、被测版本 = 镜像 tag、
  本地和 CI 跑同一份 compose，所以"本地能跑通"和"CI 能跑通"之间没有缝。
- **代价**：每次启动几十秒；测不了未发布的分支代码（需要时可以让 CI 先构建镜像）。
- **放弃的方案**：打共享 staging。它有脏数据、并发互相踩、不能做破坏性测试、
  失败没法复现——最后一条是决定性的。

### 2. 自研 CLI，不架在 pytest 上

四段式生命周期、软断言收集、artifact 落盘，这三样都不吃 pytest 的红利，反而
要绕开它的 assert-即停和 fixture 模型。

- **代价说清楚**：`-k` 过滤、并发调度、失败重试、junit xml 要自己写。
  目前实现了过滤和 artifact，**并发和重试还没有**。
- pytest 仍然在用，跑框架自己的 40 个单测——检查纯函数正是它擅长的。

### 3. 四段式 + 软断言

每个用例固定四阶段：`seed` → `execute` → `verify` → `cleanup`。

perf-lab 只有 seed/execute。这里把 **verify 单独拆出来**，是为了让"别信 200"
成为框架的性质，而不是每个 runner 作者要记住的习惯——一个空的 verify 在 review
时一眼可见。

三条判定规则：

1. **软断言**：runner 不因期望不满足而抛异常，而是往 `ctx.checks` 追加一条。
   一次运行要把所有问题说完，而不是停在第一个。
2. **失败的期望 ≠ 崩掉的用例**：前者是产品做错了，后者是用例自己没跑完。
   两者在结果文件里是不同字段，不会都糊成"红了"。
3. **零断言 = 失败**：runner 跑完一条 check 都没记，判定为 fail。
   一个什么都不断言却显示绿色的用例，比没有用例更糟。

## 加一个用例长什么样

完整的用例文件，26 行，没有任何执行逻辑：

```python
case = define_case(
    id="record/create-100-mixed",
    title="一次请求批量创建 100 条混合类型记录，并逐行回验落库结果",
    runner=RecordCreateRunner,
    owner="qa",
    timeout_s=120,
    config=RecordCreateConfig(
        table_name_prefix="lab-record-create-100",
        fields=[
            FieldSpec(name="Title", type="singleLineText"),
            FieldSpec(name="Description", type="longText"),
            FieldSpec(name="Score", type="number"),
            FieldSpec(name="Active", type="checkbox"),
        ],
        record_count=100,
        sample_rows=[1, 50, 100],
    ),
)
```

配套两件事，缺一不可，`lab check` 会红：同名的 `.md` 描述文档、`registry.py`
里的一行注册。

**数据是确定性的**：第 N 行的每个值都由 N 推导（`Title-N`、`float(N)`、
偶数行才勾 checkbox）。同一个函数既构造请求又算期望值，两边不可能对不上——
不用快照，不用黄金文件，重跑逐字节可比。

## 怎么证明它真在断言

这是 review 一个测试框架时最该问的问题，多数项目答不上来。

实测：建 20 行数据，然后**背着 runner 篡改**——把第 10 行的 `Score` 改成 999，
删掉第 20 行，再跑同一个 verify：

```
[ok  ] create.all_batches_accepted: expected=True actual=True
[ok  ] create.returned_ids: expected=20 actual=20
[FAIL] scan.record_count: expected=20 actual=19
[FAIL] scan.cell_values_match: expected=[] actual=[{'row': 10, 'field': 'Score',
                                                    'expected': 10.0, 'actual': 999}]
```

两处都抓到，并且精确到行和字段。这依赖两件事：全量分页扫描（抽样看不见
"1000 行落了 997 行"），以及期望值本地推导。

## 验收门禁：不看退出码，看证据

CI 真正 gate 的是这一步：

```bash
uv run python scripts/verify_run_acceptance.py artifacts/<run-id>
```

它从**计划**出发，要求每个计划内用例恰好产出一条能解释的结果。以下任意一条
都拒绝整轮运行：

- 计划内的用例没产出结果（**用例悄悄不跑了**）
- 出现计划外的结果
- 同一用例产出多条结果
- 跳过但没声明理由
- 判定为通过但一条 blocking 断言都没有

"没有红" 不等于验收通过。实测拒绝场景：抽掉一条结果 → `REJECTED`，并指名
`record/create-100-mixed <- planned but produced no result`。

## 现状与已知限制

**已完成**：框架闭环、3 个用例真跑通过、40 个框架单测、静态检查链
（ruff / mypy --strict / catalog 三方一致 / 文档格式 / 密钥扫描）、CI workflow。

**已知限制，写在这里而不是等人发现**：

- **用例只有 3 个**。框架能力已验证，覆盖面还没开始铺。
- **串行执行**，没有并发。用例自带隔离（每个自建 space），架构上支持并发，
  但调度还没写。
- **超时是记录不强杀**。Python 没法安全中断同步 runner，真正兜底的是 HTTP 层
  timeout。等并发改成多进程时可以做成硬超时。
- **企业功能测不了**。当前实例跑在默认授权档位，高级权限、App、自动化、AI
  这四类能力是关闭的——见下。

## 需要拍板的三件事

### 1. 验收范围包不包括企业功能？

当前实例授权档位默认，四类能力关闭：高级权限、App、自动化、AI 填充。这几类恰好
是之前调研里投入最多的方向。

架构上已经准备好（授权走环境变量注入，compose 已接好，`smoke/instance-capabilities`
会在档位变化时报红提醒更新覆盖清单）。**需要的是一条测试用授权。**

建议：**不要等**。核心功能（表/字段/记录/视图/导入导出/公式/关联）用例量最大，
当前档位完全够测，先铺起来。

### 2. 开源的时间点？

仓库按开源标准写：无内部路径、无内部主机名、无字面密钥，`lab check` 里有防误提交
的密钥扫描。

关键约束：**private 转 public 时整个 git history 一起公开**，所以"先随便写、转之前
清一遍"是清不干净的。目前仓库零 commit，起点最干净——从第一个 commit 起按 public
标准写，转的那天不需要任何补救。

建议：private 开发到用例有规模、CI 稳定绿，再转 public。

### 3. 用例优先级铺哪一块？

之前的调研沉淀了一份场景清单（表格能力若干节）。建议按"回归代价"排序而不是按
功能模块——写路径和计算字段错了最贵，读路径次之。

---

## 自己跑一遍

```bash
uv sync && uv run lab up && uv run lab run && uv run lab report
```

`lab up` 起环境并自动签入，`lab down` 清空一切。全过程不碰任何共享环境——
不显式传 `LAB_ENDPOINT` 的话，默认只打 `127.0.0.1`。
