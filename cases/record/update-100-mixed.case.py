from framework.case import define_case
from framework.runners.record_create import FieldSpec
from framework.runners.record_update import RecordUpdateConfig, RecordUpdateRunner

# Same four field types and the same 100 rows as record/create-100-mixed, seeded
# from the same value formula. That is deliberate: the two cases differ only in
# the action under test, so a failure here is about updating and not about the
# data model or the field types.
case = define_case(
    id="record/update-100-mixed",
    title="批量更新 100 条已有记录的每一个字段，并逐行回验更新后的落库结果",
    runner=RecordUpdateRunner,
    owner="qa",
    tags=["record", "bulk-update", "mixed-fields"],
    timeout_s=180,
    config=RecordUpdateConfig(
        table_name_prefix="lab-record-update-100",
        fields=[
            FieldSpec(name="Title", type="singleLineText"),
            FieldSpec(name="Description", type="longText"),
            FieldSpec(name="Score", type="number"),
            FieldSpec(name="Active", type="checkbox"),
        ],
        record_count=100,
        # 100 rows over four calls. A single-call update cannot express the
        # failure this case is about — "only part of it landed" needs more than
        # one part.
        update_batch_size=25,
        sample_rows=[1, 50, 100],
    ),
)
