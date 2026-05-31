import { getPool } from "../db/index.js";

export const COMPOSIO_TOOLKITS = {
  google_search_console: {
    label: "Google Search Console",
    authConfigEnv: "COMPOSIO_AUTH_CONFIG_GOOGLE_SEARCH_CONSOLE",
    readOnlyUse: "Search properties, queries, pages, clicks, impressions, CTR, and position.",
    supportsAssetFetch: true,
  },
  facebook: {
    label: "Facebook Pages",
    authConfigEnv: "COMPOSIO_AUTH_CONFIG_FACEBOOK",
    readOnlyUse: "List connected pages and inspect page metadata or read-only insights.",
    supportsAssetFetch: true,
  },
  instagram: {
    label: "Instagram Business",
    authConfigEnv: "COMPOSIO_AUTH_CONFIG_INSTAGRAM",
    readOnlyUse: "Inspect linked Instagram business accounts, media, profile, and read-only insights.",
    supportsAssetFetch: false,
  },
  linkedin: {
    label: "LinkedIn",
    authConfigEnv: "COMPOSIO_AUTH_CONFIG_LINKEDIN",
    readOnlyUse: "List company pages where the connected user has approved roles and read read-only page data.",
    supportsAssetFetch: true,
  },
  youtube: {
    label: "YouTube",
    authConfigEnv: "COMPOSIO_AUTH_CONFIG_YOUTUBE",
    readOnlyUse: "Read channel metadata, statistics, videos, comments, and other YouTube channel data.",
    supportsAssetFetch: true,
  },
  twitter: {
    label: "Twitter / X",
    authConfigEnv: "COMPOSIO_AUTH_CONFIG_TWITTER",
    readOnlyUse: "Read the connected account profile, public metrics, posts, and engagement signals.",
    supportsAssetFetch: true,
  },
  google_ads: {
    label: "Google Ads",
    authConfigEnv: "COMPOSIO_AUTH_CONFIG_GOOGLE_ADS",
    readOnlyUse: "Connect Google Ads access for future read-only campaign and account summaries.",
    supportsAssetFetch: false,
  },
};

let composioClient;

export const SHARED_COMPOSIO_USER_ID = "agencyos_shared";

export function getComposioUserId(workspaceId) {
  return `agencyos_workspace_${workspaceId}`;
}

export function getSharedComposioUserId() {
  return SHARED_COMPOSIO_USER_ID;
}

export function getToolkitConfig(toolkit) {
  const config = COMPOSIO_TOOLKITS[toolkit];
  if (!config) {
    const err = new Error(`Unsupported Composio toolkit: ${toolkit}`);
    err.statusCode = 400;
    throw err;
  }

  return {
    toolkit,
    ...config,
    authConfigId: process.env[config.authConfigEnv] || null,
  };
}

export function validateAuthConfigId(toolkitConfig) {
  if (!toolkitConfig.authConfigId) {
    const err = new Error(`${toolkitConfig.authConfigEnv} is not configured`);
    err.statusCode = 503;
    throw err;
  }

  if (!toolkitConfig.authConfigId.startsWith("ac_")) {
    const err = new Error(`${toolkitConfig.authConfigEnv} must be a Composio auth config ID starting with ac_`);
    err.statusCode = 400;
    throw err;
  }
}

export function listSupportedToolkits() {
  return Object.entries(COMPOSIO_TOOLKITS).map(([toolkit, config]) => ({
    toolkit,
    label: config.label,
    readOnlyUse: config.readOnlyUse,
    authConfigEnv: config.authConfigEnv,
    supportsAssetFetch: Boolean(config.supportsAssetFetch),
    configured: Boolean(process.env[config.authConfigEnv]),
  }));
}

export async function getComposioClient() {
  if (!process.env.COMPOSIO_API_KEY) {
    const err = new Error("COMPOSIO_API_KEY is not configured");
    err.statusCode = 503;
    throw err;
  }

  if (!composioClient) {
    const { Composio } = await import("@composio/core");
    composioClient = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  }
  return composioClient;
}

function safeJson(value) {
  if (!value || typeof value !== "object") return {};
  return value;
}

export function normalizeComposioAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    status: account.status || "unknown",
    statusReason: account.statusReason || account.status_reason || null,
    toolkit: account.toolkit?.slug || account.toolkit || null,
    authConfigId: account.authConfig?.id || account.auth_config?.id || null,
    isDisabled: Boolean(account.isDisabled || account.is_disabled),
    createdAt: account.createdAt || account.created_at || null,
    updatedAt: account.updatedAt || account.updated_at || null,
    alias: account.alias || null,
  };
}

export async function findWorkspaceIntegration(workspaceId, toolkit) {
  const result = await getPool().query(
    `SELECT * FROM workspace_integrations
     WHERE workspace_id = $1 AND toolkit = $2
     LIMIT 1`,
    [workspaceId, toolkit],
  );
  return result.rows[0] || null;
}

export async function listWorkspaceIntegrations(workspaceId) {
  const result = await getPool().query(
    `SELECT * FROM workspace_integrations
     WHERE workspace_id = $1
     ORDER BY toolkit ASC`,
    [workspaceId],
  );

  const existing = new Map(result.rows.map((row) => [row.toolkit, row]));
  return listSupportedToolkits().map((toolkitConfig) => {
    const row = existing.get(toolkitConfig.toolkit);
    return {
      ...toolkitConfig,
      id: row?.id || null,
      workspace_id: row?.workspace_id || workspaceId,
      composio_user_id: row?.composio_user_id || getComposioUserId(workspaceId),
      auth_config_id: row?.auth_config_id || process.env[toolkitConfig.authConfigEnv] || null,
      connected_account_id: row?.connected_account_id || null,
      connection_request_id: row?.connection_request_id || null,
      status: row?.status || "not_connected",
      label: row?.label || toolkitConfig.label,
      selected_resource: safeJson(row?.selected_resource),
      latest_summary: safeJson(row?.latest_summary),
      last_checked_at: row?.last_checked_at || null,
      last_connected_at: row?.last_connected_at || null,
      last_sync_at: row?.last_sync_at || null,
      last_error: row?.last_error || null,
      updated_at: row?.updated_at || null,
    };
  });
}

export async function upsertWorkspaceIntegration(workspaceId, toolkit, patch) {
  const composioUserId = patch.composio_user_id || getComposioUserId(workspaceId);
  const current = await findWorkspaceIntegration(workspaceId, toolkit);
  const merged = {
    composio_user_id: composioUserId,
    auth_config_id: patch.auth_config_id ?? current?.auth_config_id ?? null,
    connected_account_id: patch.connected_account_id ?? current?.connected_account_id ?? null,
    connection_request_id: patch.connection_request_id ?? current?.connection_request_id ?? null,
    status: patch.status ?? current?.status ?? "not_connected",
    label: patch.label ?? current?.label ?? null,
    selected_resource: patch.selected_resource ?? current?.selected_resource ?? {},
    latest_summary: patch.latest_summary ?? current?.latest_summary ?? {},
    last_checked_at: patch.last_checked_at ?? current?.last_checked_at ?? null,
    last_connected_at: patch.last_connected_at ?? current?.last_connected_at ?? null,
    last_sync_at: patch.last_sync_at ?? current?.last_sync_at ?? null,
    last_error: patch.last_error ?? current?.last_error ?? null,
  };

  const result = await getPool().query(
    `INSERT INTO workspace_integrations (
       workspace_id, toolkit, composio_user_id, auth_config_id, connected_account_id,
       connection_request_id, status, label, selected_resource, latest_summary,
       last_checked_at, last_connected_at, last_sync_at, last_error
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14)
     ON CONFLICT (workspace_id, toolkit) DO UPDATE SET
       composio_user_id = EXCLUDED.composio_user_id,
       auth_config_id = EXCLUDED.auth_config_id,
       connected_account_id = EXCLUDED.connected_account_id,
       connection_request_id = EXCLUDED.connection_request_id,
       status = EXCLUDED.status,
       label = EXCLUDED.label,
       selected_resource = EXCLUDED.selected_resource,
       latest_summary = EXCLUDED.latest_summary,
       last_checked_at = EXCLUDED.last_checked_at,
       last_connected_at = EXCLUDED.last_connected_at,
       last_sync_at = EXCLUDED.last_sync_at,
       last_error = EXCLUDED.last_error,
       updated_at = NOW()
     RETURNING *`,
    [
      workspaceId,
      toolkit,
      merged.composio_user_id,
      merged.auth_config_id,
      merged.connected_account_id,
      merged.connection_request_id,
      merged.status,
      merged.label,
      JSON.stringify(merged.selected_resource || {}),
      JSON.stringify(merged.latest_summary || {}),
      merged.last_checked_at,
      merged.last_connected_at,
      merged.last_sync_at,
      merged.last_error,
    ],
  );

  return result.rows[0];
}

export async function clearWorkspaceIntegration(workspaceId, toolkit) {
  const result = await getPool().query(
    `UPDATE workspace_integrations SET
       connected_account_id = NULL,
       connection_request_id = NULL,
       status = 'not_connected',
       label = NULL,
       last_error = NULL,
       last_checked_at = NOW(),
       updated_at = NOW()
     WHERE workspace_id = $1 AND toolkit = $2
     RETURNING *`,
    [workspaceId, toolkit],
  );
  return result.rows[0] || null;
}

export async function listSharedIntegrations() {
  const result = await getPool().query(
    `SELECT * FROM agency_integrations
     ORDER BY toolkit ASC, created_at ASC`,
  );

  const byToolkit = result.rows.reduce((acc, row) => {
    if (!acc[row.toolkit]) acc[row.toolkit] = [];
    acc[row.toolkit].push(row);
    return acc;
  }, {});

  return listSupportedToolkits().map((toolkitConfig) => ({
    ...toolkitConfig,
    composio_user_id: SHARED_COMPOSIO_USER_ID,
    auth_config_id: process.env[toolkitConfig.authConfigEnv] || null,
    connections: (byToolkit[toolkitConfig.toolkit] || [])
      .filter((row) => row.connected_account_id)
      .map((row) => ({
        id: row.id,
        toolkit: row.toolkit,
        composio_user_id: row.composio_user_id,
        auth_config_id: row.auth_config_id,
        connected_account_id: row.connected_account_id,
        connection_request_id: row.connection_request_id,
        status: row.status,
        label: row.label || toolkitConfig.label,
        last_checked_at: row.last_checked_at,
        last_connected_at: row.last_connected_at,
        last_error: row.last_error,
        updated_at: row.updated_at,
      })),
  }));
}

export async function upsertSharedIntegration(toolkit, patch) {
  let currentResult = { rows: [] };
  if (patch.connected_account_id) {
    currentResult = await getPool().query(
      `SELECT * FROM agency_integrations
       WHERE toolkit = $1 AND connected_account_id = $2
       LIMIT 1`,
      [toolkit, patch.connected_account_id],
    );
  } else if (patch.connection_request_id) {
    currentResult = await getPool().query(
      `SELECT * FROM agency_integrations
       WHERE toolkit = $1 AND connection_request_id = $2
       LIMIT 1`,
      [toolkit, patch.connection_request_id],
    );
  } else {
    currentResult = await getPool().query(
      `SELECT * FROM agency_integrations
       WHERE toolkit = $1 AND connected_account_id IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      [toolkit],
    );
  }
  const current = currentResult.rows[0] || null;
  const config = getToolkitConfig(toolkit);

  const merged = {
    composio_user_id: patch.composio_user_id || SHARED_COMPOSIO_USER_ID,
    auth_config_id: patch.auth_config_id ?? current?.auth_config_id ?? config.authConfigId ?? null,
    connected_account_id: patch.connected_account_id ?? current?.connected_account_id ?? null,
    connection_request_id: patch.connection_request_id ?? current?.connection_request_id ?? null,
    status: patch.status ?? current?.status ?? "not_connected",
    label: patch.label ?? current?.label ?? config.label,
    last_checked_at: patch.last_checked_at ?? current?.last_checked_at ?? null,
    last_connected_at: patch.last_connected_at ?? current?.last_connected_at ?? null,
    last_error: patch.last_error ?? current?.last_error ?? null,
  };

  if (current?.id) {
    const result = await getPool().query(
      `UPDATE agency_integrations SET
         composio_user_id = $2,
         auth_config_id = $3,
         connected_account_id = $4,
         connection_request_id = $5,
         status = $6,
         label = $7,
         last_checked_at = $8,
         last_connected_at = $9,
         last_error = $10,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        current.id,
        merged.composio_user_id,
        merged.auth_config_id,
        merged.connected_account_id,
        merged.connection_request_id,
        merged.status,
        merged.label,
        merged.last_checked_at,
        merged.last_connected_at,
        merged.last_error,
      ],
    );
    return result.rows[0];
  }

  const result = await getPool().query(
    `INSERT INTO agency_integrations (
       toolkit, composio_user_id, auth_config_id, connected_account_id,
       connection_request_id, status, label, last_checked_at, last_connected_at, last_error
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (toolkit, connected_account_id) DO UPDATE SET
       composio_user_id = EXCLUDED.composio_user_id,
       auth_config_id = EXCLUDED.auth_config_id,
       connection_request_id = EXCLUDED.connection_request_id,
       status = EXCLUDED.status,
       label = EXCLUDED.label,
       last_checked_at = EXCLUDED.last_checked_at,
       last_connected_at = EXCLUDED.last_connected_at,
       last_error = EXCLUDED.last_error,
       updated_at = NOW()
     RETURNING *`,
    [
      toolkit,
      merged.composio_user_id,
      merged.auth_config_id,
      merged.connected_account_id,
      merged.connection_request_id,
      merged.status,
      merged.label,
      merged.last_checked_at,
      merged.last_connected_at,
      merged.last_error,
    ],
  );

  return result.rows[0];
}

export async function getSharedIntegrationByAccount(toolkit, connectedAccountId) {
  const result = await getPool().query(
    `SELECT * FROM agency_integrations
     WHERE toolkit = $1 AND connected_account_id = $2
     LIMIT 1`,
    [toolkit, connectedAccountId],
  );
  return result.rows[0] || null;
}
