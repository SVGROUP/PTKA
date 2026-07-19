#!/usr/bin/env python3
"""日历待办：管理员建账号 / 改密 / 设 sendkey 命令行工具。

用法（在项目根目录执行）：
    python -m scripts.calendar_user_add add <username>          # 新建用户（交互输入密码）
    python -m scripts.calendar_user_add passwd <username>        # 重置某用户密码
    python -m scripts.calendar_user_add sendkey <username> <key> # 设置某用户 sendkey
    python -m scripts.calendar_user_add clear-sendkey <username>  # 清除某用户 sendkey
    python -m scripts.calendar_user_add list                      # 列出所有真实用户

数据库路径与服务一致：环境变量 CALENDAR_TODO_DB 覆盖，否则 data/calendar.db。
不开放前台注册，账号由管理员用本脚本创建。
"""
from __future__ import annotations

import getpass
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

# 允许直接 `python scripts/calendar_user_add.py`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pt_keepalive.api.calendar_auth import hash_password, PUBLIC_USERNAME  # noqa: E402
from pt_keepalive.config import app_config  # noqa: E402


def _db_path() -> str:
    default_db = os.path.abspath(
        os.path.join(os.path.dirname(app_config.database_path), "calendar.db")
    )
    return os.path.abspath(os.environ.get("CALENDAR_TODO_DB", default_db))


def _ensure_users_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            sendkey       TEXT,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        "INSERT OR IGNORE INTO users (id, username, password_hash, sendkey) "
        "VALUES (0, '__public__', '!', NULL)"
    )
    conn.commit()


def _prompt_password() -> str:
    p1 = getpass.getpass("请输入新密码（至少6位）: ")
    if len(p1) < 6:
        print("密码太短（至少6位）", file=sys.stderr)
        sys.exit(1)
    p2 = getpass.getpass("再次输入确认: ")
    if p1 != p2:
        print("两次输入不一致", file=sys.stderr)
        sys.exit(1)
    return p1


def cmd_add(conn, username: str) -> None:
    if username == PUBLIC_USERNAME:
        print("该用户名为系统保留，禁止使用", file=sys.stderr)
        sys.exit(1)
    exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if exists:
        print(f"用户已存在: {username}", file=sys.stderr)
        sys.exit(1)
    pw = _prompt_password()
    conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, hash_password(pw)),
    )
    conn.commit()
    print(f"已创建用户: {username}")


def cmd_passwd(conn, username: str) -> None:
    row = conn.execute("SELECT id FROM users WHERE username = ? AND id > 0", (username,)).fetchone()
    if row is None:
        print(f"用户不存在: {username}", file=sys.stderr)
        sys.exit(1)
    pw = _prompt_password()
    conn.execute(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE username = ?",
        (hash_password(pw), username),
    )
    # 踢掉旧会话
    conn.execute(
        "DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)",
        (username,),
    )
    conn.commit()
    print(f"已重置密码: {username}")


def cmd_sendkey(conn, username: str, key: str) -> None:
    row = conn.execute("SELECT id FROM users WHERE username = ? AND id > 0", (username,)).fetchone()
    if row is None:
        print(f"用户不存在: {username}", file=sys.stderr)
        sys.exit(1)
    if not key.strip():
        print("sendkey 不能为空", file=sys.stderr)
        sys.exit(1)
    conn.execute(
        "UPDATE users SET sendkey = ?, updated_at = datetime('now') WHERE username = ?",
        (key.strip(), username),
    )
    conn.commit()
    print(f"已设置 sendkey: {username}")


def cmd_clear_sendkey(conn, username: str) -> None:
    row = conn.execute("SELECT id FROM users WHERE username = ? AND id > 0", (username,)).fetchone()
    if row is None:
        print(f"用户不存在: {username}", file=sys.stderr)
        sys.exit(1)
    conn.execute(
        "UPDATE users SET sendkey = NULL, updated_at = datetime('now') WHERE username = ?",
        (username,),
    )
    conn.commit()
    print(f"已清除 sendkey: {username}")


def cmd_list(conn) -> None:
    rows = conn.execute(
        "SELECT id, username, (sendkey IS NOT NULL AND sendkey != '') AS has_key, created_at "
        "FROM users WHERE id > 0 ORDER BY id"
    ).fetchall()
    if not rows:
        print("(无真实用户)")
        return
    print(f"{'id':<5}{'username':<20}{'sendkey':<10}created_at")
    for r in rows:
        print(f"{r[0]:<5}{r[1]:<20}{('已配置' if r[2] else '未配置'):<10}{r[3]}")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    action = args[0]
    db_path = _db_path()
    with closing(sqlite3.connect(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        _ensure_users_table(conn)
        if action == "add" and len(args) == 2:
            cmd_add(conn, args[1])
        elif action == "passwd" and len(args) == 2:
            cmd_passwd(conn, args[1])
        elif action == "sendkey" and len(args) == 3:
            cmd_sendkey(conn, args[1], args[2])
        elif action == "clear-sendkey" and len(args) == 2:
            cmd_clear_sendkey(conn, args[1])
        elif action == "list" and len(args) == 1:
            cmd_list(conn)
        else:
            print(__doc__)
            sys.exit(1)


if __name__ == "__main__":
    main()
