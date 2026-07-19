#!/usr/bin/env python3
"""Import CalendarApp SQLite data into PT Keepalive's database.

默认使用场景：把 CalendarApp 的 data.db 复制到 PTKA 数据库同目录，然后执行本脚本。

默认路径：
  源库：<目标库目录>/calendar_app.db
  目标：./data/pt-keepalive.db

推荐线上用法：
  cd /PTKA
  cp /path/to/CalendarApp/data.db ./data/calendar_app.db
  python3 scripts/import_calendar_db.py

也可以显式指定路径：
  python3 scripts/import_calendar_db.py /PTKA/data/calendar_app.db /PTKA/data/pt-keepalive.db

脚本特性：
  - 自动备份目标库
  - 自动创建/迁移日历表
  - tag_colors 按 tag upsert
  - tasks 默认不保留原 id，使用目标库自增 id
  - tasks 按关键字段去重，可重复执行
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime
from pathlib import Path

DEFAULT_TARGET_DB = Path("./data/pt-keepalive.db")
DEFAULT_SOURCE_NAME = "calendar_app.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    notes      TEXT    NOT NULL DEFAULT '',
    date       TEXT    NOT NULL,
    start_time TEXT,
    end_time   TEXT,
    done       INTEGER NOT NULL DEFAULT 0,
    priority   INTEGER NOT NULL DEFAULT 0,
    group_id   TEXT,
    color      TEXT,
    tag        TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_tag  ON tasks(tag);

CREATE TABLE IF NOT EXISTS tag_colors (
    tag        TEXT PRIMARY KEY,
    color      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

MIGRATIONS = [
    "ALTER TABLE tasks ADD COLUMN color TEXT",
    "ALTER TABLE tasks ADD COLUMN tag   TEXT",
    "ALTER TABLE tasks ADD COLUMN start_time TEXT",
    "ALTER TABLE tasks ADD COLUMN end_time   TEXT",
]

REQUIRED_SOURCE_TABLES = {"tasks", "tag_colors"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="把 CalendarApp 的 data.db 导入到 pt-keepalive 数据库",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  # 默认：源库为 ./data/calendar_app.db，目标库为 ./data/pt-keepalive.db
  python3 scripts/import_calendar_db.py

  # 显式指定源库和目标库
  python3 scripts/import_calendar_db.py /PTKA/data/calendar_app.db /PTKA/data/pt-keepalive.db

  # 只检查不写入
  python3 scripts/import_calendar_db.py --dry-run
""",
    )
    parser.add_argument(
        "source_db",
        nargs="?",
        type=Path,
        help="CalendarApp 源数据库路径；默认是目标库同目录下的 calendar_app.db",
    )
    parser.add_argument(
        "target_db",
        nargs="?",
        type=Path,
        default=DEFAULT_TARGET_DB,
        help="pt-keepalive 目标数据库路径，默认 ./data/pt-keepalive.db",
    )
    parser.add_argument(
        "--source-name",
        default=DEFAULT_SOURCE_NAME,
        help="未指定 source_db 时，在目标库目录查找的源库文件名，默认 calendar_app.db",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="导入前不备份目标数据库",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只统计将导入/跳过的数据，不写入目标库",
    )
    return parser.parse_args()


def resolve_paths(args: argparse.Namespace) -> tuple[Path, Path]:
    target_db = args.target_db.expanduser().resolve()
    if args.source_db is None:
        source_db = target_db.parent / args.source_name
    else:
        source_db = args.source_db.expanduser().resolve()
    return source_db, target_db


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def list_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {row["name"] for row in rows}


def validate_source(conn: sqlite3.Connection, source_db: Path) -> None:
    tables = list_tables(conn)
    missing = REQUIRED_SOURCE_TABLES - tables
    if missing:
        raise RuntimeError(f"源数据库 {source_db} 缺少表：{', '.join(sorted(missing))}")


def ensure_target_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    existing = {row[1] for row in conn.execute("PRAGMA table_info(tasks)")}
    for stmt in MIGRATIONS:
        col = stmt.split()[5]
        if col not in existing:
            conn.execute(stmt)
    conn.commit()


def backup_target(target_db: Path) -> Path | None:
    if not target_db.exists():
        return None
    backup = target_db.with_name(
        f"{target_db.name}.{datetime.now().strftime('%Y%m%d-%H%M%S')}.bak"
    )
    shutil.copy2(target_db, backup)
    return backup


def normalize_row_value(value):
    return "" if value is None else value


def task_exists(dst: sqlite3.Connection, row: sqlite3.Row) -> bool:
    found = dst.execute(
        """
        SELECT 1 FROM tasks
        WHERE title = ?
          AND notes = ?
          AND date = ?
          AND COALESCE(start_time, '') = ?
          AND COALESCE(end_time, '') = ?
          AND done = ?
          AND priority = ?
          AND COALESCE(group_id, '') = ?
          AND COALESCE(color, '') = ?
          AND COALESCE(tag, '') = ?
        LIMIT 1
        """,
        (
            row["title"],
            row["notes"],
            row["date"],
            normalize_row_value(row["start_time"]),
            normalize_row_value(row["end_time"]),
            int(row["done"]),
            int(row["priority"]),
            normalize_row_value(row["group_id"]),
            normalize_row_value(row["color"]),
            normalize_row_value(row["tag"]),
        ),
    ).fetchone()
    return found is not None


def open_target_for_import(target_db: Path, *, dry_run: bool) -> tuple[sqlite3.Connection, Path | None]:
    """Open target DB. Dry-run uses memory/temp copy and never writes target_db."""
    if not dry_run:
        return connect(target_db), None
    if not target_db.exists():
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        return conn, None
    temp = tempfile.NamedTemporaryFile(prefix="ptka-calendar-import-", suffix=".db", delete=False)
    temp_path = Path(temp.name)
    temp.close()
    shutil.copy2(target_db, temp_path)
    return connect(temp_path), temp_path


def import_data(source_db: Path, target_db: Path, *, dry_run: bool) -> dict[str, int]:
    src = connect(source_db)
    dst, temp_target = open_target_for_import(target_db, dry_run=dry_run)
    try:
        validate_source(src, source_db)
        ensure_target_schema(dst)

        tag_rows = src.execute(
            "SELECT tag, color, updated_at FROM tag_colors ORDER BY tag"
        ).fetchall()
        task_rows = src.execute(
            """
            SELECT title, notes, date, start_time, end_time, done, priority,
                   group_id, color, tag, created_at
            FROM tasks
            ORDER BY id
            """
        ).fetchall()

        inserted_tags = 0
        inserted_tasks = 0
        skipped_tasks = 0

        for row in tag_rows:
            if not dry_run:
                dst.execute(
                    """
                    INSERT INTO tag_colors(tag, color, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(tag) DO UPDATE SET
                        color = excluded.color,
                        updated_at = excluded.updated_at
                    """,
                    (row["tag"], row["color"], row["updated_at"]),
                )
            inserted_tags += 1

        for row in task_rows:
            if task_exists(dst, row):
                skipped_tasks += 1
                continue
            if not dry_run:
                dst.execute(
                    """
                    INSERT INTO tasks(
                        title, notes, date, start_time, end_time,
                        done, priority, group_id, color, tag, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row["title"],
                        row["notes"],
                        row["date"],
                        row["start_time"],
                        row["end_time"],
                        int(row["done"]),
                        int(row["priority"]),
                        row["group_id"],
                        row["color"],
                        row["tag"],
                        row["created_at"],
                    ),
                )
            inserted_tasks += 1

        if dry_run:
            dst.rollback()
        else:
            dst.commit()

        return {
            "source_tags": len(tag_rows),
            "upserted_tags": inserted_tags,
            "source_tasks": len(task_rows),
            "inserted_tasks": inserted_tasks,
            "skipped_tasks": skipped_tasks,
        }
    finally:
        src.close()
        dst.close()
        if temp_target is not None:
            temp_target.unlink(missing_ok=True)


def main() -> int:
    args = parse_args()
    source_db, target_db = resolve_paths(args)

    if not source_db.exists():
        print(f"错误：源数据库不存在：{source_db}", file=sys.stderr)
        print(
            f"提示：可以把 CalendarApp 的 data.db 复制为 {target_db.parent / args.source_name}",
            file=sys.stderr,
        )
        return 2

    target_db.parent.mkdir(parents=True, exist_ok=True)

    if args.dry_run:
        print("DRY-RUN：只检查和统计，不写入目标数据库")
    elif not args.no_backup:
        backup = backup_target(target_db)
        if backup:
            print(f"已备份目标数据库：{backup}")
        else:
            print("目标数据库不存在，将自动创建")

    try:
        result = import_data(source_db, target_db, dry_run=args.dry_run)
    except Exception as exc:  # noqa: BLE001 - CLI should present concise failure
        print(f"导入失败：{exc}", file=sys.stderr)
        return 1

    print(f"源数据库：{source_db}")
    print(f"目标数据库：{target_db}")
    print(f"标签颜色：源 {result['source_tags']} 条，处理 {result['upserted_tags']} 条")
    print(
        "任务：源 {source_tasks} 条，新增 {inserted_tasks} 条，跳过重复 {skipped_tasks} 条".format(
            **result
        )
    )
    print("完成" if not args.dry_run else "检查完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
