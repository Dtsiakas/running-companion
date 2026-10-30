-- OAuth 2.1 state for the remote MCP endpoint (Claude's custom connector signs in through OAuth).
-- Codes and tokens are stored as SHA-256 hashes: a copy of the database can't be used to call the API.

-- Clients that registered themselves (OAuth dynamic client registration), e.g. Claude.
CREATE TABLE oauth_clients (
  client_id                 TEXT PRIMARY KEY,
  client_json               TEXT    NOT NULL,   -- the full registration as returned to the client
  created_at                INTEGER NOT NULL
) STRICT;

-- One-time authorization codes, exchanged for tokens within minutes.
CREATE TABLE oauth_codes (
  code_hash                 TEXT PRIMARY KEY,
  client_id                 TEXT    NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  redirect_uri              TEXT    NOT NULL,
  code_challenge            TEXT    NOT NULL,   -- PKCE: proves the token request comes from whoever started the login
  scopes                    TEXT    NOT NULL,   -- space-separated
  resource                  TEXT,
  expires_at                INTEGER NOT NULL
) STRICT;

CREATE TABLE oauth_tokens (
  token_hash                TEXT PRIMARY KEY,
  kind                      TEXT    NOT NULL CHECK (kind IN ('access', 'refresh')),
  client_id                 TEXT    NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  scopes                    TEXT    NOT NULL,
  resource                  TEXT,
  expires_at                INTEGER NOT NULL,
  created_at                INTEGER NOT NULL
) STRICT;

CREATE INDEX oauth_tokens_by_expiry ON oauth_tokens (expires_at);
