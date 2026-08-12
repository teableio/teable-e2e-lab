# Agent Playbook: 加一个用例

你在帮人给 Teable 加一条接口验收用例。对方通常知道要测的产品行为，但不熟这个仓库。
你来驱动流程，不要先让他学内部结构。

从上往下读这一篇，需要时再翻另外三篇：

- [target.md](target.md) —— 被测环境允许你测什么。**动手前先读**。
- [case-spec.md](case-spec.md) —— 写代码前先确认的那份 spec。
- [checklist.md](checklist.md) —— 写的时候必须守住的硬规则。

## 流程

```text
intake -> 查能力 -> 写 spec -> 确认 -> 选 runner -> 写 -> 注册 -> check -> 真跑 -> 汇报
```

交付物不是"能通过 `lab check` 的文件"，而是**一个真跑过、artifact 证据完整的
用例**，外加一份对方不用翻代码就能读懂的说明。

### 1. Intake

对方一般只会给出其中几项：

- **场景**：被测的产品动作（"一次导入 1000 行 CSV 并保持字段类型"）。
- **前置状态**：要先有什么数据。
- **正确的定义**：怎样算对。这一项最常缺，也最重要——追这一项。
- 接口细节：路径、payload、header。

接口信息够写 spec 就别去翻产品代码。只有在确实不知道某个行为怎么表现时，才去看
`framework/runners/*.py` 或产品实现。

### 2. 查能力

确认你要测的能力在被测实例上是**开着的**，方法见 [target.md](target.md)。

这一步花一分钟，省的是"用例写完跑红了，才发现测的东西压根没启用"。授权档位变化时，
`smoke/instance-capabilities` 会红并指名哪一项——看到它红，先怀疑授权，别怀疑产品。

### 3. 写 spec

用 [case-spec.md](case-spec.md) 的模板，缺的部分你自己补全，**每一条你推断的都
标成假设**。对方负责确认或纠正，不该由他来写 spec。

### 4. 确认

把 spec 给对方看。只有当答案会改变实现时才提问（比如行数会不会让产品走另一条
代码路径、某个字段的空值语义是什么）。

例外：对方明确要求端到端交付，或人不在，就按合理默认往下做，把每个假设标出来，
最后在汇报里重复一遍，方便事后纠正。

### 5. 选 runner

```text
复用现有 runner -> 扩展现有 runner -> 新写 runner
```

优先复用。只有当现有 runner 表达不了这个场景时才扩展；只有当扩展会扭曲现有 runner
的行为时才新写。新 runner 必须实现完整四段式，且 `verify` 不能是空的。

### 6. 写

两个同名文件：

```text
cases/<group>/<name>.case.py    # define_case() 的配置
cases/<group>/<name>.md         # 描述文档
```

`.case.py` 规则：

- `id` 必须等于路径：`cases/record/create-100-mixed.case.py` -> `record/create-100-mixed`。
- 不要改已有用例的 `id`，那等于换了一个用例，历史就断了。
- 模块级变量必须叫 `case`。
- 用例里不写执行逻辑。要写逻辑，说明该动 runner。

`.md` 规则：frontmatter（`owner`、`tags`、`enabled`）打头，然后是 `Goal`、
`Seed Phase`、`Execute Phase`、`Expectations`、`Cleanup` 五节。`Expectations`
那节要写清楚**每条断言在证明什么**，不是复述代码。

### 7. 注册

在 `registry.py` 的 `CASES` 里加一行。少这一行，用例就是死的——`lab check` 会红。

### 8. Check

```bash
uv run lab check && uv run ruff check . && uv run mypy && uv run pytest -q
```

这一步**不碰真实 Teable**，只验证目录一致性、配置合法性、文档格式和框架自测。

### 9. 真跑

```bash
uv run lab up
uv run lab run <case-id>
```

跑完必须打开 `artifacts/<run-id>/<case>.result.json` 检查证据，只看退出码不算数。
最低要求见 [../AGENTS.md](../AGENTS.md) 的 Verification 一节。

**新用例还要做一次负向验证**：想办法让它应该失败（改期望值、篡改落库数据、指向
一个已知有问题的版本），确认它真的报红且报在对的地方。一个从来没见过它失败的用例，
不能证明它有用。

### 10. 汇报

- 一句话说清这个用例测什么，用产品语言。
- 一张小表：用例 -> 判定 + 关键断言的实际值。
- 你做过的每个假设，尤其是行数、字段形状、空值语义。
- 改了哪些文件，以及怎么复现这次运行。

## 只在被卡住时提问

默认按合理默认往下做并标注假设。只有当答案会改变你要写的东西时才停下来问。
