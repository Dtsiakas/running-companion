/**
 * Checks that the API key works by exchanging it for a token and reading the profile.
 * Prints nothing secret: neither the key nor the token.
 *
 *   npm run auth:check
 */
import { createGarminApi, GarminError } from '@companion/garmin-client';
import { loadEnv, TOKEN_CACHE_FILE, garminKey } from '@companion/config';

loadEnv();

try {
  const { api, tokens } = createGarminApi({ apiKey: garminKey(), tokenCacheFile: TOKEN_CACHE_FILE });
  const token = await tokens.getToken();
  const hoursLeft = ((token.expiresAt - Date.now()) / 3_600_000).toFixed(1);
  console.log(`✓ Key accepted. Access token valid for ${hoursLeft}h.`);

  await api.profileSettings();
  console.log('✓ Profile endpoint responded. You are ready to run: npm run discover');
} catch (error) {
  console.error(`✗ ${error instanceof GarminError ? error.message : String(error)}`);
  process.exitCode = 1;
}
