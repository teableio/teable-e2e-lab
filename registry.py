"""The registered case list — the single source of truth for what runs.

Registration is explicit and by id, and `lab check` fails loud when this list,
the `.case.py` files on disk, and their same-name `.md` files disagree in any
direction. That three-way agreement is what stops a case from silently dropping
out of the suite: a file nobody registered, or a registration pointing at
nothing, is an error rather than a shrug.

Adding a case means three things in the same change:
  cases/<group>/<name>.case.py, cases/<group>/<name>.md, and an entry here.
"""

CASES = [
    "smoke/auth-user",
    "smoke/instance-capabilities",
    "record/create-100-mixed",
    "record/update-100-mixed",
]
