export class NotImplementedError extends Error {
  constructor(message = "Not implemented yet") {
    super(message);
    this.name = "NotImplementedError";
  }
}

export class DataSourceError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = "DataSourceError";
  }
}

export class RateLimitError extends Error {
  constructor(public readonly limit: number, public readonly windowLabel: string) {
    super(`Rate limit hit: ${limit} per ${windowLabel}`);
    this.name = "RateLimitError";
  }
}

export class PrivateAccountError extends Error {
  constructor(public readonly handle: string, public readonly platform: string) {
    super(`@${handle} is a private ${platform} account — only public accounts can be analyzed.`);
    this.name = "PrivateAccountError";
  }
}

// Thrown when a provider API returns a DIFFERENT account than the one we
// requested — typically because the exact handle didn't exist and the API
// fell back to a fuzzy-match. Bubbles past the safe() mock fallback so the
// user sees a clean 404 instead of misleading fake data.
export class HandleNotFoundError extends Error {
  constructor(public readonly handle: string, public readonly platform: string) {
    super(`No public ${platform} account found for @${handle}. Double-check the exact handle spelling.`);
    this.name = "HandleNotFoundError";
  }
}

// Thrown when the upstream RapidAPI provider returns 429 (rate limit).
// Bubbles past safe()'s mock fallback so the user sees a real "provider
// rate limited" message instead of silently-generated fake data.
export class ProviderRateLimitError extends Error {
  constructor(public readonly host: string, public readonly path: string) {
    super(`Upstream provider ${host} is rate-limited right now. Please try again in a minute.`);
    this.name = "ProviderRateLimitError";
  }
}

export class PaymentError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = "PaymentError";
  }
}
