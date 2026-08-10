from framework.case import define_case
from framework.runners.record_create import (
    FieldSpec,
    RecordCreateConfig,
    RecordCreateRunner,
)

case = define_case(
    id="record/create-100-mixed",
    title="一次请求批量创建 100 条混合类型记录，并逐行回验落库结果",
    runner=RecordCreateRunner,
    owner="qa",
    tags=["record", "bulk-create", "mixed-fields"],
    timeout_s=120,
    config=RecordCreateConfig(
        table_name_prefix="lab-record-create-100",
        fields=[
            FieldSpec(name="Title", type="singleLineText"),
            FieldSpec(name="Description", type="longText"),
            FieldSpec(name="Score", type="number"),
            FieldSpec(name="Active", type="checkbox"),
        ],
        record_count=100,
        sample_rows=[1, 50, 100],
    ),
)
