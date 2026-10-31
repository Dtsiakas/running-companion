import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';

/**
 * OAuth 2.1 authorization server for the remote MCP endpoint, for a single user.
 *
 * The MCP SDK implements the protocol (metadata, client registration, request validation, PKCE checks, token endpoint);
 * this class supplies the parts specific to us: where clients and tokens are stored, and how the user approves access.
 * Approval happens on our own login + consent page (routes/oauth.ts); `authorize` only parks the request and sends the
 * browser there.
 */
export const SCOPE = 'companion';
const CODE_TTL_MS = 5 * 60_000;
const ACCESS_TTL_MS = 60 * 60_000;
const REFRESH_TTL_MS = 30 * 86_400_000;
const PENDING_TTL_MS = 10 * 60_000;

export interface PendingAuthorization {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');

export class CompanionOAuthProvider implements OAuthServerProvider {
  readonly #db: DatabaseSync;
  /** Authorization requests waiting for the user to log in and approve. In memory: they live for minutes. */
  readonly #pending = new Map<string, PendingAuthorization>();

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => {
        const row = this.#db.prepare('SELECT client_json FROM oauth_clients WHERE client_id = ?').get(clientId);
        return row ? (JSON.parse(String(row.client_json)) as OAuthClientInformationFull) : undefined;
      },
      registerClient: (metadata) => {
        const client: OAuthClientInformationFull = { ...metadata, client_id: randomUUID(), client_id_issued_at: Math.floor(Date.now() / 1000) };
        this.#db
          .prepare('INSERT INTO oauth_clients (client_id, client_json, created_at) VALUES (?, ?, ?)')
          .run(client.client_id, JSON.stringify(client), Date.now());
        return client;
      },
    };
  }

  // Step 1: the SDK has validated the request; park it and send the browser to our consent page.
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    this.#dropExpiredPending();
    const requestId = randomToken();
    this.#pending.set(requestId, { client, params, createdAt: Date.now() });
    res.redirect(`/oauth/consent?request=${encodeURIComponent(requestId)}`);
  }

  getPending(requestId: string): PendingAuthorization | undefined {
    const pending = this.#pending.get(requestId);
    return pending && Date.now() - pending.createdAt < PENDING_TTL_MS ? pending : undefined;
  }

  /** Step 2: the user approved. Returns the client's redirect URL carrying a one-time code. */
  approve(requestId: string): URL {
    const pending = this.#takePending(requestId);
    const code = randomToken();
    this.#db
      .prepare(
        `INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, scopes, resource, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sha256(code),
        pending.client.client_id,
        pending.params.redirectUri,
        pending.params.codeChallenge,
        (pending.params.scopes?.length ? pending.params.scopes : [SCOPE]).join(' '),
        pending.params.resource?.href ?? null,
        Date.now() + CODE_TTL_MS,
      );
    return redirectWith(pending, { code });
  }

  /** The user declined: tell the client, as the spec requires. */
  deny(requestId: string): URL {
    return redirectWith(this.#takePending(requestId), { error: 'access_denied' });
  }

  // Step 3: the SDK checks PKCE with the challenge stored alongside the code.
  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    return this.#findCode(client, authorizationCode).code_challenge as string;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, redirectUri?: string): Promise<OAuthTokens> {
    const code = this.#findCode(client, authorizationCode);
    if (redirectUri && redirectUri !== code.redirect_uri) throw new InvalidGrantError('redirect_uri does not match the authorization request');
    // Codes are single use.
    this.#db.prepare('DELETE FROM oauth_codes WHERE code_hash = ?').run(sha256(authorizationCode));
    return this.#issueTokens(client.client_id, String(code.scopes), (code.resource as string | null) ?? null);
  }

  // Refresh tokens rotate: each one works once and is replaced, so a stolen old one is useless.
  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens> {
    const row = this.#db
      .prepare(`SELECT scopes, resource, expires_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh' AND client_id = ?`)
      .get(sha256(refreshToken), client.client_id);
    if (!row || Number(row.expires_at) < Date.now()) throw new InvalidGrantError('Refresh token is invalid or expired');
    this.#db.prepare('DELETE FROM oauth_tokens WHERE token_hash = ?').run(sha256(refreshToken));
    return this.#issueTokens(client.client_id, String(row.scopes), (row.resource as string | null) ?? null);
  }

  // Step 4: every /mcp request.
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = this.#db
      .prepare(`SELECT client_id, scopes, resource, expires_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'access'`)
      .get(sha256(token));
    if (!row || Number(row.expires_at) < Date.now()) throw new InvalidTokenError('Access token is invalid or expired');
    return {
      token,
      clientId: String(row.client_id),
      scopes: String(row.scopes).split(' '),
      expiresAt: Math.floor(Number(row.expires_at) / 1000),
      resource: row.resource ? new URL(String(row.resource)) : undefined,
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    this.#db.prepare('DELETE FROM oauth_tokens WHERE token_hash = ? AND client_id = ?').run(sha256(request.token), client.client_id);
  }

  /**
   * Removes expired codes and tokens, and clients that haven't held a token for a month. Registration is open (that's
   * how Claude connects), so without this every abandoned or repeated connection attempt would stay forever.
   * Called by the scheduler.
   */
  pruneExpired(): void {
    const now = Date.now();
    this.#db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').run(now);
    this.#db.prepare('DELETE FROM oauth_tokens WHERE expires_at < ?').run(now);
    this.#db
      .prepare('DELETE FROM oauth_clients WHERE created_at < ? AND client_id NOT IN (SELECT client_id FROM oauth_tokens) AND client_id NOT IN (SELECT client_id FROM oauth_codes)')
      .run(now - REFRESH_TTL_MS);
  }

  #issueTokens(clientId: string, scopes: string, resource: string | null): OAuthTokens {
    const accessToken = randomToken();
    const refreshToken = randomToken();
    const now = Date.now();
    const insert = this.#db.prepare(
      'INSERT INTO oauth_tokens (token_hash, kind, client_id, scopes, resource, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    insert.run(sha256(accessToken), 'access', clientId, scopes, resource, now + ACCESS_TTL_MS, now);
    insert.run(sha256(refreshToken), 'refresh', clientId, scopes, resource, now + REFRESH_TTL_MS, now);
    return { access_token: accessToken, token_type: 'bearer', expires_in: ACCESS_TTL_MS / 1000, refresh_token: refreshToken, scope: scopes };
  }

  #findCode(client: OAuthClientInformationFull, authorizationCode: string) {
    const row = this.#db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ? AND client_id = ?').get(sha256(authorizationCode), client.client_id);
    if (!row || Number(row.expires_at) < Date.now()) throw new InvalidGrantError('Authorization code is invalid or expired');
    return row;
  }

  #takePending(requestId: string): PendingAuthorization {
    const pending = this.getPending(requestId);
    this.#pending.delete(requestId);
    if (!pending) throw new Error('This sign-in request has expired. Start again from Claude.');
    return pending;
  }

  #dropExpiredPending(): void {
    for (const [id, pending] of this.#pending) if (Date.now() - pending.createdAt >= PENDING_TTL_MS) this.#pending.delete(id);
  }
}

function redirectWith(pending: PendingAuthorization, params: Record<string, string>): URL {
  const url = new URL(pending.params.redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (pending.params.state) url.searchParams.set('state', pending.params.state);
  return url;
}
