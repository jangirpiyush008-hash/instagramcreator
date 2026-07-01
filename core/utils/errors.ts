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

export class PaymentError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = "PaymentError";
  }
}
