#!/usr/bin/env python3
"""
Apply a SQL file to the Supabase project via the Management API.

Direct Postgres connections are blocked from this container, so migrations go
over HTTPS instead. Usage:

    python3 scripts/run-migration.py supabase/migrations/0001_init.sql
"""
import json
import os
import sys
import urllib.error
import urllib.request

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "tzqlcdfchamvawqvogxw")
TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]


def run_sql(sql: str):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            # Supabase sits behind Cloudflare, which rejects urllib's default
            # user agent with a 1010.
            "User-Agent": "yardtize-migrate/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        print(f"FAILED ({exc.code}): {body}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    path = sys.argv[1]
    with open(path, encoding="utf-8") as fh:
        sql = fh.read()
    result = run_sql(sql)
    print(f"applied {path} -> {json.dumps(result)[:200]}")


if __name__ == "__main__":
    main()
