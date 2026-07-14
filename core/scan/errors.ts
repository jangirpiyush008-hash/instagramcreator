// Maps executor / adapter errors to consistent HTTP responses. Used by
// /api/scan (web) and /v1/scan (public API) so both surfaces show the
// same error codes for the same failures.

import { NextResponse } from "next/server";
import {
  DataSourceError,
  HandleNotFoundError,
  NotImplementedError,
  PrivateAccountError,
  ProviderRateLimitError,
} from "@/core/utils/errors";
import { ScanExecutorError } from "./executor";

export interface ScanErrorResponse {
  ok: false;
  error: string;
  code: string;
}

export function toScanErrorResponse(e: unknown): NextResponse<ScanErrorResponse> {
  if (e instanceof ScanExecutorError && e.code === "not_available") {
    return NextResponse.json({ ok: false, error: e.message, code: "not_available" }, { status: 404 });
  }
  if (e instanceof HandleNotFoundError) {
    return NextResponse.json({ ok: false, error: e.message, code: "not_found" }, { status: 404 });
  }
  if (e instanceof ProviderRateLimitError) {
    return NextResponse.json(
      { ok: false, error: e.message, code: "provider_rate_limit" },
      { status: 503 },
    );
  }
  if (e instanceof PrivateAccountError) {
    return NextResponse.json(
      { ok: false, error: e.message, code: "private_account" },
      { status: 422 },
    );
  }
  if (e instanceof NotImplementedError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This tool isn't wired to a live data source for this platform yet.",
        code: "not_implemented",
      },
      { status: 501 },
    );
  }
  if (e instanceof DataSourceError) {
    return NextResponse.json(
      { ok: false, error: e.message, code: "data_source" },
      { status: 502 },
    );
  }
  console.error("[scan] unexpected error", e);
  return NextResponse.json(
    { ok: false, error: "Unexpected error", code: "unknown" },
    { status: 500 },
  );
}
