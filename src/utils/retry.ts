/**
 * Retry a function with exponential backoff for transient errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, initialDelayMs = 100, maxDelayMs = 1000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error;

      // Check if it's a retryable error (5xx or network errors)
      const isRetryable =
        error instanceof Error &&
        ("status" in error
          ? (error as { status: number }).status >= 500
          : error.message.includes("ECONNRESET") ||
            error.message.includes("ETIMEDOUT") ||
            error.message.includes("Service Unavailable"));

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt) + Math.random() * 100,
        maxDelayMs
      );

      console.log(
        `[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
