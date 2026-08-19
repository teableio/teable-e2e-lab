# Cross-repo dispatch: where the release link stands

## The link that exists today

`teable-enterprise`'s `promote-latest-ee.yaml` carries a `trigger-api-lab` job
(merged as PR #92 there) that dispatches **`acceptance.yml` in this
repository**, by filename, with a `teable_image_tag` input after every
production promote. It authenticates as the `teable-remote-ci` GitHub App.

Two facts about it, both expensive to rediscover:

- **It has never fired end-to-end.** Its first real test is the next
  production release. If it goes red then, check the App's installation scope
  covers this repository before suspecting anything else.
- **The promote is the only Docker Hub writer.** Builds do not push images;
  promotion does. That is why the acceptance hook hangs off promote and must
  never be moved to the build workflow — it would resolve tags that do not
  exist. (Documented in teable-enterprise's `build-teable.yaml` comments.)

## What changed in this repository

This repository was rewritten from the image-based API acceptance lab into
**e2e-lab**: commit-based bug regression, dispatched with teable-ee commits
(`e2e-lab.yml`), not image tags. The suite the release link was built to call
no longer exists.

`acceptance.yml` is kept as a **compatibility shim**: it accepts the old
inputs, records the dispatch in its job summary, and succeeds. The promote
pipeline stays green and the dispatch leaves evidence it fired — which matters
precisely because the link is unproven.

## Retargeting (follow-up, needs a teable-enterprise PR)

teable-enterprise builds and ships the product; changes there go through PR,
never direct push. The retargeting options, in order of usefulness:

1. Map the promoted tag to the teable-ee commit it was built from and dispatch
   `e2e-lab.yml` with that commit — release acceptance becomes "every
   fixed-status bug case passes on the released revision".
2. Drop the `trigger-api-lab` job.

Until one of those merges, the shim answers the call.
