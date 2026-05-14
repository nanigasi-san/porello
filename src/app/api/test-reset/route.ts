import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resetSqliteForTests } from "@/lib/sqlite-store";

export const runtime = "nodejs";

export async function POST() {
  const sqlitePath = process.env.PORELLO_SQLITE_PATH;

  if (process.env.NODE_ENV === "production" || process.env.PORELLO_E2E_TEST_DB !== "1" || !sqlitePath) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const resolvedPath = path.resolve(sqlitePath);
  const dataDir = path.resolve(process.cwd(), ".porello-data");

  if (!resolvedPath.startsWith(`${dataDir}${path.sep}`)) {
    return NextResponse.json({ ok: false, error: "E2E database must be inside .porello-data." }, { status: 403 });
  }

  resetSqliteForTests();

  for (const filePath of [resolvedPath, `${resolvedPath}-wal`, `${resolvedPath}-shm`]) {
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
  }

  return NextResponse.json({ ok: true, skipped: false });
}
