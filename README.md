# teable-api-lab

Teable 接口功能验收。用例是数据，执行是共享 runner，结果是可解释的证据。

框架思想来自 `teable-perf-lab`——同一套纪律（用例即配置、目录三方一致、同名描述
文档、全量证据落盘、fail-closed 验收），但目标换了：perf-lab 追求**可比性**，
这里追求**覆盖度和可诊断性**。

## 快速开始

```bash
uv sync
git config core.hooksPath .githooks   # 启用 pre-commit 密钥拦截，每个 clone 一次
uv run lab up          # Docker 起一套一次性 Teable，签入，缓存会话
uv run lab doctor      # 环境自检
uv run lab list        # 看有哪些用例
uv run lab run         # 跑全部注册用例
uv run lab report      # 看最近一次运行的结果
uv run lab down        # 停掉并清空所有状态
```

## Read Order

| 你想知道 | 读哪篇 |
|---|---|
| 这个项目为什么这么设计、怎么证明断言不是摆设 | [REVIEW.md](REVIEW.md) |
| 怎么加一条用例 | [.agents/README.md](.agents/README.md) |
| 现在允许测什么（授权档位、能力开关） | [.agents/target.md](.agents/target.md) |
| 写用例时必须守住的硬规则 | [.agents/checklist.md](.agents/checklist.md) |
| 怎么从发布流水线自动触发验收 | [docs/dispatching.md](docs/dispatching.md) |
| 术语（Case / Runner / Check / Verdict / Evidence） | [CONTEXT.md](CONTEXT.md) |
| 结果文件长什么样 | [framework/types.py](framework/types.py) 的 `CaseResult` |

## 执行模型

每个用例四个阶段，顺序固定：

| 阶段 | 职责 | 失败时 |
|---|---|---|
| `seed` | 建立被测动作所需的状态，并**证明**它就绪 | 记 error，跳过 execute/verify，仍跑 cleanup |
| `execute` | 执行被测动作，返回观察到的东西 | 同上 |
| `verify` | 通过真实读路径证明最终状态，把期望写进 `ctx.checks` | 不抛异常，记 check |
| `cleanup` | 删掉自己造的东西。**任何路径都会跑** | 记成 warning，不影响产品判定 |

三条判定规则：

1. **软断言。** 期望不满足不抛异常，而是往 `ctx.checks` 追加一条。一次运行要把所有
   问题都说完，而不是停在第一个。
2. **失败的期望 ≠ 崩掉的用例。** 前者是产品做错了，后者是用例自己没跑完。两者在
   artifact 里是不同字段，不会都糊成"红了"。
3. **零断言 = 失败。** 一条 check 都没记就判 fail。什么都不断言却显示绿色的用例，
   比没有用例更糟。

取舍的理由在 [REVIEW.md](REVIEW.md)，写用例时要守的规则在
[.agents/checklist.md](.agents/checklist.md)。

## 验收：不看退出码，看证据

```bash
uv run python scripts/verify_run_acceptance.py artifacts/<run-id>
```

它从**计划**出发，要求每个计划内用例恰好产出一条能解释的结果。少一条、多一条、
重复、无理由跳过、判定通过却零断言，任意一条都拒绝整轮运行。

**"没有红"不等于验收通过。**

## 被测环境

`docker/compose.yaml` 起的是**一次性**环境，不是部署：无持久卷、固定的一次性密码、
`lab down` 会 `-v` 清空所有状态。本地和 CI 跑同一份 compose，所以"本地能跑通"和
"CI 能跑通"之间没有缝。

```bash
TEABLE_IMAGE_TAG=release.2026-08-10T07-45-10Z.2574 uv run lab up   # 指定被测版本
LAB_ENDPOINT=https://your-teable-instance.example.com uv run lab run smoke   # 打已有环境
```

默认 tag 是会动的 `latest`，但每次运行都会把镜像 digest 记进运行页，所以"那次测的
到底是哪个构建"永远答得上来。CI 上的验收由发布方派发并带上确切的 tag，见
[docs/dispatching.md](docs/dispatching.md)。

授权档位决定了哪些能力可测，那份清单由 `smoke/instance-capabilities` 这一个用例
持有，别处不复述——怎么查见 [.agents/target.md](.agents/target.md)。

## 密钥

这个仓库是公开的，唯一的真实凭据是被测环境的授权 key，**只从环境变量来，任何时候
都不写进文件**。

四道拦截：pre-commit hook 扫暂存区、`lab check` 扫全仓库、artifact 落盘前脱敏、
CI 对已登记 secret 打码。每道都有单测，机制说明见 [REVIEW.md](REVIEW.md) 的
"密钥怎么防"，日常操作规则见 [AGENTS.md](AGENTS.md)。

## File Map

- `registry.py`：注册用例 id 清单。改用例必改这里。
- `cases/<group>/<name>.case.py`：用例配置，唯一入口是 `define_case()`。
- `cases/<group>/<name>.md`：同名描述文档，格式受 `lab check` 约束。
- `framework/types.py`：核心契约——`Case`、`Runner` 四段式、`Check`、`CaseResult`。
- `framework/runners/*.py`：runner 实现。共享执行逻辑都在这里，用例里不写逻辑。
- `framework/executor.py`：四段式驱动，判定 verdict，保证任何路径都落 artifact。
- `framework/verify.py`：全量分页扫描与轮询就绪，"别信 200"的工具箱。
- `framework/catalog.py`：用例发现与三方一致性（磁盘 / registry / 同名 md）。
- `framework/acceptance.py`：fail-closed 验收模型。
- `framework/client.py`：HTTP 客户端，逐条记录请求进 artifact，非 2xx 不抛异常。
- `framework/environment.py`：Docker 起停与会话 bootstrap。
- `docker/compose.yaml`：一次性被测环境（无持久卷，`down -v` 清空）。
- `scripts/`：可单独跑的检查脚本，纯逻辑在 `framework/` 里，方便单测。
- `tests/`：框架自身的单测（pytest）。**不测 Teable，只测框架的纯函数。**
