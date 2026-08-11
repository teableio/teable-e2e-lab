# 项目导读（给第一次看这个仓库的人）

Teable 接口功能验收。一句话概括设计：**用例是数据，执行是共享 runner，结果是可解释
的证据。** 框架思想来自 `teable-perf-lab`——同一套纪律，目标换成覆盖度和可诊断性。

现状：框架闭环、3 个用例真跑通过、42 个框架单测、静态检查链、CI 已接。
**需要你拍四件事，在最后一节。**

## 三个关键决策

**1. Docker 起一次性实例，不打 staging**

`docker/compose.yaml` 起一整套（Teable + Postgres + Redis），跑完 `down -v` 清空。

- 换来：每次全新无脏数据、可做破坏性用例、被测版本 = 镜像 tag、本地和 CI 跑同一份
  compose，所以"本地能跑通"和"CI 能跑通"之间没有缝。
- 代价：每次启动几十秒；测不了未发布的分支代码。
- 放弃 staging 的决定性理由：**失败没法复现**。

**2. 自研 CLI，不架在 pytest 上**

四段式生命周期、软断言收集、artifact 落盘，这三样都不吃 pytest 的红利，反而要绕开
它的 assert-即停和 fixture 模型。

- 代价说清楚：并发调度和失败重试要自己写，**目前都还没有**。
- pytest 仍在用，跑框架自己的 42 个单测——检查纯函数正是它擅长的。

**3. 四段式 + 软断言**

每个用例固定 `seed` → `execute` → `verify` → `cleanup`。perf-lab 只有前两段，这里把
**verify 单独拆出来**，是为了让"别信 200"成为框架的性质，而不是每个 runner 作者要记住
的习惯——一个空的 verify 在 review 时一眼可见。

三条判定规则：

- **软断言**：期望不满足不抛异常，往 `ctx.checks` 追加一条。一次运行把所有问题说完，
  而不是停在第一个。
- **失败的期望 ≠ 崩掉的用例**：前者是产品做错了，后者是用例自己没跑完。两者在结果
  文件里是不同字段，不会都糊成"红了"。
- **零断言 = 失败**：一条 check 都没记就判 fail。什么都不断言却显示绿色的用例，比没有
  用例更糟。

## 加一个用例的成本

一个 26 行的配置文件（[例子](cases/record/create-100-mixed.case.py)），**没有任何执行
逻辑**，配套同名 `.md` 和 `registry.py` 里的一行，缺一个 `lab check` 就红。

数据由行号确定性推导，所以同一个函数既构造请求又算期望值，两边不可能对不上——不用
快照，不用黄金文件，重跑逐字节可比。

## 怎么证明这套断言不是摆设

review 一个测试框架时最该问的问题，多数项目答不上来。

实测：建 20 行数据，然后**背着 runner 篡改**——把第 10 行的 `Score` 改成 999，删掉第
20 行，再跑同一个 verify：

```
[FAIL] scan.record_count: expected=20 actual=19
[FAIL] scan.cell_values_match: expected=[] actual=[{'row': 10, 'field': 'Score',
                                                    'expected': 10.0, 'actual': 999}]
```

两处都抓到，精确到行和字段。靠的是全量分页扫描（抽样看不见"1000 行落了 997 行"）和
期望值本地推导。

**验收门不看退出码，看证据。** 它从*计划*出发，要求每个计划内用例恰好产出一条能解释
的结果；少一条、多一条、重复、无理由跳过、零断言通过，任意一条都拒绝整轮运行。实测
抽掉一条结果 → `REJECTED`，并指名是哪个用例。**"没有红"不等于验收通过。**

## 什么时候跑

不定时跑，也不是改了 lab 代码就跑，而是**每次正式发布跑一次**。

`teableio/teable` 这个公开镜像只有"提升"（promote）那一刻才写入 Docker Hub，那是唯一
能拉到镜像的时刻。验收接在那里，测的正好是自托管用户马上要拉的东西。频率低，但每次
都有意义。

接线方式沿用 perf-lab：**实验室只开一个 dispatch 口，由发布方带着确切的 release id 来
调**，实验室不去读任何其它仓库的事件。好处是这个仓库一个跨仓库权限都不需要——它要开源。

## 已知限制

写在这里，而不是等人发现：

- **用例只有 3 个**。框架能力已验证，覆盖面还没开始铺。
- **串行执行**。用例自带隔离（各自建 space），架构上支持并发，调度还没写。
- **超时是记录不强杀**。真正兜底的是 HTTP 层 timeout。
- **授权档位取决于 secret 有没有配**。配了跑企业档位，没配跑默认档位；
  `smoke/instance-capabilities` 断言的就是这件事，所以授权失效会红在这里。

## 已定（2026-08-11 review 反馈）

**授权已给，并且已经在 CI 上跑通。** 走 `BACKEND_ENTERPRISE_LICENSE_KEY` +
`BACKEND_ENTERPRISE_LICENSE_AUTO_RESET_INSTANCE_ID` 两个环境变量，前者的值放在仓库
secret 里，后者不是密钥、写在 compose 里并注明了为什么必须开。密钥不进代码、不进
commit、不进 CI 日志、不进结果文件——四道拦截各有单测，见下方"密钥怎么防"。

实测的授权面（`level: business`，读自真实运行的 artifact，不是照授权推的）：

- **17 项能力开启**，含高级权限、App、自动化、AI 填充、审计日志、用户组、按钮字段、
  行着色、自定义域名等。
- **1 项关闭**：`organizationEnable`。这是当前唯一的覆盖边界。
- **9 项数值限制全部无限**（`-1`），包括 `maxRows` 和 `apiRateLimit`，所以大数据量
  用例不会因为限流失败。

`smoke/instance-capabilities` 把这份清单钉死并每次运行原样记录整个 `limit` 对象，所以
授权到期（**2026-09-26**）或档位变化会先红在这里、指名是哪一项，而不是让下游一堆用例
各自失败。

**infra 验收进第二期。** Docker 版和 k8s 版的部署本身也要纳入验收，
已开 [#1](https://github.com/teableio/teable-api-lab/issues/1) 跟踪，一期先铺接口用例覆盖面。

**自动触发已提 PR。** [teable-enterprise#92](https://github.com/teableio/teable-enterprise/pull/92)：
在提升完成后派发验收，带上刚推的确切 release id。纯插入 50 行，没动任何现有 job。
合并前要加 secret `API_LAB_DISPATCH_TOKEN`（对本仓库有 Actions 写权限）；没配也不影响
发布，那个 job 会单独失败并打印缺什么。

**用例按"回归代价"排。** 写路径和计算字段错了最贵，读路径次之。

**开源时间点：先跑一段时间再定。** 开源前把提交历史清一次、重新提交一次，再转 public。
执行时有两点要注意：

- **在原仓库上 force push 清不干净。** 被覆盖的对象在 GitHub 上仍可按 SHA 取到，转
  public 之后同样如此。要真清干净，只能**新建一个仓库**推一个初始提交。
- **提交历史本身是文档。** 每条 commit message 记的是某个设计为什么这么定，清掉就没了。
  目前历史里没有密钥、没有内部主机名、没有私有仓库名（全历史扫过，0 命中），所以清历史
  是可选的保险，不是必需的补救——真到那天可以重新权衡。

## 需要你拍板的两件事

**1. 合并 [teable-enterprise#92](https://github.com/teableio/teable-enterprise/pull/92)，并配 secret**

PR 已开，等审。要配的是 `API_LAB_DISPATCH_TOKEN`。合并之后每次正式发布自动跑一轮验收。

挂在提升而不是构建，理由写在那个文件自己的注释里——构建不往 Docker Hub 推任何东西，
提升是唯一的写入方。那里已经有一个同样形状的 `notify-infra`，验收就排在它旁边。

**没合也能用**，只是每次发布要有人手动点一下 Run workflow。

<details>
<summary>PR 里加的 job，留档备查</summary>

```yaml
  trigger-api-lab:
    name: Trigger teable-api-lab acceptance
    needs: [promote-latest, sync-aliyun]
    # 跟 notify-infra 同样的门槛：两条都成功，才说明 teableio/teable 上这个
    # tag 确实存在。提前派发等于让实验室去拉一个还没推上去的镜像。
    if: needs.promote-latest.result == 'success' && needs.sync-aliyun.result == 'success'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Dispatch acceptance run to teable-api-lab
        env:
          DISPATCH_TOKEN: ${{ secrets.API_LAB_DISPATCH_TOKEN }}
        run: |
          set -euo pipefail

          if [ -z "${DISPATCH_TOKEN}" ]; then
            echo "::error::Missing API_LAB_DISPATCH_TOKEN. It needs Actions write access to teableio/teable-api-lab."
            exit 1
          fi

          # 传不出确切的 release id 就别派发：实验室的默认值是 latest，而 latest
          # 会动——一次说不清测了什么的运行，不如不跑。
          if [ -z "${RELEASE_ID}" ]; then
            echo "::error::No release id to test."
            exit 1
          fi

          curl -fsS -X POST \
            -H "Authorization: Bearer ${DISPATCH_TOKEN}" \
            -H "Accept: application/vnd.github+json" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            https://api.github.com/repos/teableio/teable-api-lab/actions/workflows/acceptance.yml/dispatches \
            -d "{\"ref\":\"main\",\"inputs\":{\"teable_image_tag\":\"${RELEASE_ID}\",\"case_filter\":\"all\"}}"

          echo "dispatched teable-api-lab acceptance teable_image_tag=${RELEASE_ID}"
```

单开一个 job 而不是往 `notify-infra` 里塞一步，是因为两件事的失败含义不同：通知平台
失败意味着发布没送达，派发验收失败只意味着这一轮没测。混在一起，一个 curl 挂了会让
另一件事看起来也挂了。

</details>

**2. 什么时候转 public？**

已定"先跑一段时间再决定"，所以这条是等数据，不是等意见。判断依据建议是：用例有规模、
CI 连续绿、自动触发跑顺。转的方式和注意事项写在上面"已定"一节。

## 密钥怎么防

授权密钥是这个仓库里唯一的真实凭据，而仓库要开源。四道拦截，每道都有单测：

| 会泄到哪 | 拦在哪 | 怎么验的 |
|---|---|---|
| 代码 / commit | `lab check` + pre-commit hook 扫**暂存区**内容 | 实测：暂存带 key 的版本再改磁盘文件，照样拦住 |
| CI 运行日志 | Actions 对已登记 secret 全程打码 | 平台保证 |
| 结果文件（会上传 CI、会贴进报告） | 落盘前把环境里的敏感值从整份 JSON 里换掉 | 实测：服务端在 400 body 里回显 key，写出来的文件里是 `<redacted-secret>` |
| 拉取历史 | 从第一个 commit 起就没进过 | 实测：全部 commit grep JWT 特征，0 命中 |

第三道是最容易漏的：调用点再小心，也管不住服务端把 key 回显在错误响应里、再被
如实记进证据。所以脱敏做在**写盘那一刻**，而不是靠每个 runner 作者记得。

## 自己跑一遍

```bash
uv sync && uv run lab up && uv run lab run && uv run lab report
```

`lab up` 起环境并自动签入，`lab down` 清空一切。不显式传 `LAB_ENDPOINT` 的话默认只打
`127.0.0.1`，全程不碰任何共享环境。
