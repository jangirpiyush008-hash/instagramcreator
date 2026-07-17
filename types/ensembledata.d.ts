// Ambient shim for the official `ensembledata` package. Their npm
// module ships plain JS with JSDoc annotations, so TypeScript would
// otherwise infer it as `any`. Only the surface we actually use is
// declared here — extend when we start calling more methods.

declare module "ensembledata" {
  export class EDResponse<T = unknown> {
    statusCode: number;
    data: T;
    unitsCharged: number;
  }

  export class EDError extends Error {
    statusCode: number;
    detail: string;
    unitsCharged: number;
  }

  interface EDInstagram {
    userDetailedInfo(
      args: { username: string },
      options?: { timeout?: number },
    ): Promise<EDResponse<unknown>>;
    userInfo(
      args: { username: string },
      options?: { timeout?: number },
    ): Promise<EDResponse<unknown>>;
    userPosts(
      args: { userId: string; depth?: number; oldestTimestamp?: number },
      options?: { timeout?: number },
    ): Promise<EDResponse<unknown>>;
    userFollowers(
      args: { userId: string; pageToken?: string },
      options?: { timeout?: number },
    ): Promise<EDResponse<unknown>>;
    postComments(
      args: { code: string; depth?: number },
      options?: { timeout?: number },
    ): Promise<EDResponse<unknown>>;
  }

  interface EDTiktok {
    userInfoFromUsername(
      args: { username: string },
      options?: { timeout?: number },
    ): Promise<EDResponse<unknown>>;
    userPostsFromUsername(
      args: { username: string; depth?: number },
      options?: { timeout?: number },
    ): Promise<EDResponse<unknown>>;
    postCommentsById(
      args: { awemeId: string; cursor?: number },
      options?: { timeout?: number },
    ): Promise<EDResponse<unknown>>;
  }

  interface EDClientInstance {
    instagram: EDInstagram;
    tiktok: EDTiktok;
  }

  export function EDClient(options: {
    token: string;
    timeout?: number;
    maxNetworkRetries?: number;
  }): EDClientInstance;
}
