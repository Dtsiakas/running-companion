import type { DatabaseSync } from 'node:sqlite';
import { createMcpServer } from '@companion/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Router, type RequestHandler } from 'express';

export interface McpRouteOptions {
  db: DatabaseSync;
  /** Used only to cache the weather forecast. */
  writeDb: DatabaseSync;
  sync: () => Promise<unknown>;
  /** Runs the query tool's SQL off the server's thread (see runQueryIsolated). */
  query?: (sql: string) => Promise<unknown>;
  /** Rejects requests without a valid OAuth access token. */
  requireToken: RequestHandler;
}

/**
 * The remote MCP endpoint: the same tools as Claude Desktop's local server, over HTTP.
 *
 * Stateless mode: every POST gets a fresh MCP server and transport, and nothing is kept between requests.
 * Our tools don't need conversation state, so there are no sessions to store, expire or lose on restart.
 * Building the server per request is cheap: it only registers the tool definitions; the database connection is shared.
 */
export function mcpRoutes({ db, writeDb, sync, query, requireToken }: McpRouteOptions): Router {
  const router = Router();

  router.post('/mcp', requireToken, express.json({ limit: '1mb' }), async (req, res) => {
    const server = createMcpServer({ db, writeDb, sync, query });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request failed:', error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  });

  // Stateless servers have no stream to resume and no session to delete.
  const notAllowed: RequestHandler = (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  };
  router.get('/mcp', notAllowed);
  router.delete('/mcp', notAllowed);

  return router;
}
