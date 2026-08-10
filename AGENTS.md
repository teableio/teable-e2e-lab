# Agent Guide

这个仓库是 Teable 接口功能验收的控制面。

先读 [README.md](README.md) 拿项目全貌。要加或改用例，读 [.agents/README.md](.agents/README.md)
并先写 case spec——那个目录是作业流程的唯一来源，不要在这里复述。

## Working Rules

- 改动限制在本仓库内，除非用户明确要求动别的 checkout。
- 用例定义在 `cases/**/*.case.py`，每个必须有同名 `.md`。
- 可运行的用例必须注册进 `registry.py`。
- 共享执行逻辑属于 `framework/`，用例文件里不写逻辑。
- 数据保持确定性，期望值本地推导，让重跑逐字节可比。
- 断言只走公共 API。框架不提供数据库连接，不要绕过这一点。

## Verification

改完代码或文档，先跑静态链：

```bash
uv run lab check && uv run ruff check . && uv run mypy && uv run pytest -q
```

`lab check` 会校验目录三方一致（磁盘 `.case.py` / `registry.py` 的 CASES /
同名 `.md`）、每个用例能加载并通过配置校验、每份描述文档符合格式契约。三者有任何
一处对不上就失败。

**静态全绿不等于完成。** 用例必须真跑过，并检查过 artifact 里的证据：

```bash
uv run lab up
uv run lab run <case-id>
uv run lab report
```

最低证据要求（在 `artifacts/<run-id>/<case>.result.json` 里看）：

- `verdict` 为 `pass`
- `checks` 里有实质断言，不是只有 `cleanup.completed`
- 值类用例的 `scan.record_count` 等于配置的行数
- `requests` 里能看到完整的请求链，且没有意料之外的 4xx/5xx

只看 `lab run` 的退出码就交付，等于没验证。

## 加一个用例要动的文件

```text
cases/<group>/<name>.case.py     # define_case() 的配置
cases/<group>/<name>.md          # 同名描述，格式见 .agents/case-spec.md
registry.py                      # CASES 里加一行
```

三处缺一，`lab check` 就红。
