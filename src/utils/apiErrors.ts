import axios from 'axios';

function parseDetailFromResponseData(data: unknown): string | null {
  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }
  if (data && typeof data === 'object' && 'detail' in data) {
    const apiDetail = (data as { detail?: unknown }).detail;
    if (typeof apiDetail === 'string' && apiDetail.trim()) {
      return apiDetail.trim();
    }
    if (Array.isArray(apiDetail)) {
      const messages = apiDetail
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object' && 'msg' in item) {
            return String((item as { msg: unknown }).msg);
          }
          return null;
        })
        .filter((value): value is string => Boolean(value && value.trim()));
      if (messages.length) {
        return messages.join('; ');
      }
    }
  }
  return null;
}

/**
 * Extracts API error text from axios errors (same shape as resident app / admin web).
 */
export const getApiErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
  depth = 0,
): string => {
  if (depth > 6) {
    return fallback;
  }

  if (axios.isAxiosError(error)) {
    const parsed = parseDetailFromResponseData(error.response?.data);
    if (parsed) {
      return parsed;
    }
  }

  const anyErr = error as { response?: { data?: unknown }; cause?: unknown };
  if (anyErr?.response?.data !== undefined) {
    const parsed = parseDetailFromResponseData(anyErr.response.data);
    if (parsed) {
      return parsed;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (anyErr.cause !== undefined && anyErr.cause !== null) {
    return getApiErrorMessage(anyErr.cause, fallback, depth + 1);
  }

  return fallback;
};
