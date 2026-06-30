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

export class PaymentError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = "PaymentError";
  }
}
