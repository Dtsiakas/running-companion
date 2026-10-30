export class GarminError extends Error {
  override name = 'GarminError';
}

/** No API key found in the environment or the key file. */
export class MissingApiKeyError extends GarminError {
  override name = 'MissingApiKeyError';

  constructor(keyFile: string) {
    super(
      "No Garmin Personal API key yet. Add it in the app's Settings, set GARMIN_PERSONAL_API_KEY, " +
        `or save the key (and nothing else) to ${keyFile}.`,
    );
  }
}

/** A non-2xx response from Garmin. The response body is kept (truncated) because Garmin's error text is often the only clue. */
export class GarminHttpError extends GarminError {
  override name = 'GarminHttpError';

  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly responseText: string;

  constructor(status: number, method: string, path: string, responseText: string) {
    super(`${method} ${path} failed with HTTP ${status}${responseText ? `: ${responseText.slice(0, 300)}` : ''}`);
    this.status = status;
    this.method = method;
    this.path = path;
    this.responseText = responseText;
  }
}

/** Garmin refused the API key itself: wrong, expired or deleted. */
export class InvalidApiKeyError extends GarminError {
  override name = 'InvalidApiKeyError';

  readonly httpError: GarminHttpError;

  constructor(httpError: GarminHttpError) {
    super(
      `Garmin rejected the Personal API key (HTTP ${httpError.status}). It may be wrong, expired or deleted. ` +
        'Create a new one at https://connect.garmin.com/app/settings/personalApiToken',
    );
    this.httpError = httpError;
  }
}
