# automation/a-script-can-call-the-automation-runtime

**T8595** — open; introduced by `4af293b86` (#4618).

## What the user sees

Automations whose scripts send mail or call AI start failing on every run after
an upgrade, with "This API can only be called from automation scripts", although
the call does come from an automation script.

## What the checkpoint asserts

When a record triggers the automation, none of the email, AI and
integration-token runtime endpoints refuses the script's token as not coming
from an automation script, and the run ends successfully. What each endpoint
does after that check is not judged, because a test instance has no mail server
or AI model.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards, and an
active automation in that base with a record-created trigger and one script
step. A small local server stands in for the script sandbox and runs the code it
receives in a child process. The same script reads the table with the same
token, and that read must succeed, which proves the token is valid.
