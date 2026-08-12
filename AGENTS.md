# Agent Guide

这个仓库是 Teable 接口功能验收的控制面。

先读 [README.md](README.md) 拿项目全貌。要加或改用例，读 [.agents/README.md](.agents/README.md)
并先写 case spec——那个目录是作业流程的唯一来源，不要在这里复述。

动手写用例前先读 [.agents/target.md](.agents/target.md)：被测环境的授权档位决定了
你被允许测什么，对着一个没开启的能力写用例是这里最浪费时间的做法。

## Working Rules

- 改动限制在本仓库内，除非用户明确要求动别的 checkout。
- 用例定义在 `cases/**/*.case.py`，每个必须有同名 `.md`。
- 可运行的用例必须注册进 `registry.py`。
- 共享执行逻辑属于 `framework/`，用例文件里不写逻辑。
- 数据保持确定性，期望值本地推导，让重跑逐字节可比。
- 断言只走公共 API 的真实读路径。

## 这几件事看起来像疏漏，其实是设计

改之前先问，别顺手"修好"：

- **CI 的验收运行只由 dispatch 触发**，不定时跑、不在 push 上跑。它测的是发布出来的
  镜像，跟谁改了这个仓库无关。理由和接线方式见 [docs/dispatching.md](docs/dispatching.md)。
- **框架没有数据库连接。** 用户是通过 API 用产品的，绕过 API 验证会漏掉缓存、序列化、
  权限过滤这些最容易错的层。见 [.agents/target.md](.agents/target.md)。
- **不显式传 `LAB_ENDPOINT` 就只打 `127.0.0.1`。** 别为了方便改默认值。
- **`cleanup` 失败只记 warning。** 产品没错，是测试自己的家务事没做干净，不该把运行判红。

## 密钥

这个仓库是公开的，唯一的真实凭据是被测环境的授权 key，它只从环境变量来。

- **任何时候都不要把密钥值写进文件**，包括"先试一下待会删掉"。`lab check` 和
  pre-commit hook 都会拦，后者扫的是**暂存区内容**而不是工作树。
- 扫描报错时，正确的做法是把值挪进环境变量、写成 `${NAME}`；只有确实是一次性容器的
  抛弃值，才登记进 `framework/secret_scan.py` 的 `KNOWN_THROWAWAY`——登记是一个有意识
  的动作，不是消除报错的手段。
- 新增任何会带进敏感值的环境变量时，**同时**把变量名加进 `framework/artifacts.py` 的
  `SECRET_ENV_NAMES`。漏了这一步，脱敏就是空转，而结果文件是会上传到 CI 的。

## Verification

改完代码或文档，先跑静态链：

```bash
uv run lab check && uv run ruff check . && uv run mypy && uv run pytest -q
```

`lab check` 会校验目录三方一致（磁盘 `.case.py` / `registry.py` 的 CASES /
同名 `.md`）、每个用例能加载并通过配置校验、每份描述文档符合格式契约、以及全仓库
没有字面密钥。任何一处对不上就失败。

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
