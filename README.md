# teable-api-lab

Teable 接口功能验收。用例是数据，执行是共享 runner，结果是可解释的证据。

框架思想来自 `teable-perf-lab`——同一套纪律（用例即配置、目录三方一致、同名描述
文档、全量证据落盘、fail-closed 验收），但目标换了：perf-lab 追求**可比性**，
这里追求**覆盖度和可诊断性**。

## 快速开始

```bash
uv sync
uv run lab up          # Docker 起一套一次性 Teable，签入，缓存会话
uv run lab doctor      # 环境自检
uv run lab run         # 跑全部注册用例
uv run lab report      # 看最近一次运行的结果
uv run lab down        # 停掉并清空所有状态
```

## Read Order

- **第一次看这个项目**：读 [REVIEW.md](REVIEW.md)——十分钟看完设计取舍、
  加一个用例的成本、以及怎么证明这套断言不是摆设。
- 加或改用例：先读 [.agents/README.md](.agents/README.md)，按流程先写 case spec。
- 想知道断言该写到什么程度：读 [.agents/checklist.md](.agents/checklist.md)。
- 想知道结果文件长什么样：读 [framework/types.py](framework/types.py) 的 `CaseResult`。
- 术语（Case / Runner / Check / Verdict / Evidence 等）：读 [CONTEXT.md](CONTEXT.md)。

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

## Hard Rules

- 用例 id 必须等于它在 `cases/` 下的路径。改名等于换一个用例。
- 每个用例三件套缺一不可：`.case.py` + 同名 `.md` + `registry.py` 里的一行。
- 用例文件里不写执行逻辑。逻辑进 runner，用例只声明配置和期望。
- 数据必须由行号确定性推导，期望值本地算出来。不用快照，不用黄金文件。
- 断言走公共 API 的真实读路径。框架不提供数据库连接，这是刻意的。
- 用例自带隔离：自己建 space，跑完删掉。用例之间不共享状态。
- 交付前跑 `uv run lab check`（静态）**和** `uv run lab run <case>`（真跑），
  并检查 artifact 里的证据——退出码不算验证。

## 执行模型

每个用例四个阶段，顺序固定：

| 阶段 | 职责 | 失败时 |
|---|---|---|
| `seed` | 建立被测动作所需的状态，并**证明**它就绪 | 记 error，跳过 execute/verify，仍跑 cleanup |
| `execute` | 执行被测动作，返回观察到的东西 | 同上 |
| `verify` | 通过真实读路径证明最终状态，把期望写进 `ctx.checks` | 不抛异常，记 check |
| `cleanup` | 删掉自己造的东西。**任何路径都会跑** | 记成 warning，不影响产品判定 |

三条判定规则值得单独记住：

1. **软断言。** runner 不因为期望不满足而抛异常，而是往 `ctx.checks` 里追加一条。
   一次运行要把所有问题都说完，而不是停在第一个。
2. **失败的期望 ≠ 崩掉的用例。** 前者是产品做错了，后者是用例自己没跑完。两者在
   artifact 里是不同字段，不会都糊成"红了"。
3. **零断言 = 失败。** runner 跑完一条 check 都没记，判定为 fail。一个什么都不
   断言却显示绿色的用例，比没有用例更糟。

## 验收

CI 门禁看的不是 runner 的退出码，是 artifact：

```bash
uv run python scripts/verify_run_acceptance.py artifacts/<run-id>
```

它从**计划**出发，要求每个计划内用例恰好产出一条能解释的结果。以下任意一条都会
拒绝整轮运行：

- 计划内的用例没产出结果（用例悄悄不跑了）
- 出现计划外的结果
- 同一用例产出多条结果
- 跳过但没声明理由
- 判定为通过但一条 blocking 断言都没有

"没有红" 不等于验收通过。

## 被测环境

`docker/compose.yaml` 起的是**一次性**环境，不是部署：无持久卷、固定的一次性密码、
`lab down` 会 `-v` 清空所有状态。好处是本地和 CI 跑的是同一份 compose，"本地能跑通"
和"CI 能跑通"之间没有缝。

被测版本由镜像 tag 决定：

```bash
TEABLE_IMAGE_TAG=1.9.0 uv run lab up     # CI 必须钉死具体 tag
```

也可以打一个已有环境（会跳过 Docker）：

```bash
LAB_ENDPOINT=https://your-teable-instance.example.com uv run lab run smoke
```

打共享环境时注意：用例的隔离假设（自己建 space、跑完删）仍然成立，但破坏性用例
和并发要自己掂量。

## 安全约定

这个仓库是公开的，所以密钥处理有硬约定：

- **仓库里不放任何真实密钥。** `docker/compose.yaml` 里那些固定值（数据库密码、
  各种加密 key）是一次性容器的抛弃值，`lab down` 之后就不存在了。它们登记在
  `framework/secret_scan.py` 的 `KNOWN_THROWAWAY` 里——登记是一个有意识的动作。
- **`lab check` 会拦住误提交。** 任何名字像密钥的赋值，值必须是 `${ENV}` 占位符、
  GitHub secret 引用，或已登记的抛弃值，否则报错。
- **artifact 落盘前统一脱敏。** 结果文件会上传到 CI、也可能贴进报告，所以写盘前会
  把环境里的敏感值（如授权 key）从整份 JSON 里替换掉——包括错误响应体和堆栈里被
  服务端回显的那种。请求日志本身不记录任何 header。
- **需要授权时走环境变量**，本地用 shell 环境或 `docker/.env`（已 gitignore），
  CI 用 repository secret。不要为了"先试一下"把值写进文件。

```bash
LICENSE_KEY=... uv run lab up     # 本地临时传入，不落盘
```

## 当前用例

| id | 说明 |
|---|---|
| `smoke/auth-user` | 已认证会话能读回自己的用户信息 |
| `smoke/instance-capabilities` | 被测实例的授权档位与能力开关符合本套用例的假设 |
| `record/create-100-mixed` | 批量创建 100 条混合类型记录，并逐行回验落库结果 |

写新用例前先跑一次 `smoke/instance-capabilities`，或直接查
`GET /api/instance/usage`：对着一个没开启的能力写用例，是这套验收里最浪费时间的
做法。
