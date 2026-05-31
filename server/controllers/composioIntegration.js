import { getPool } from "../db/index.js";
import {
  clearWorkspaceIntegration,
  getComposioClient,
  getComposioUserId,
  getSharedComposioUserId,
  getToolkitConfig,
  getSharedIntegrationByAccount,
  listSharedIntegrations,
  listSupportedToolkits,
  listWorkspaceIntegrations,
  normalizeComposioAccount,
  upsertSharedIntegration,
  upsertWorkspaceIntegration,
  validateAuthConfigId,
} from "../services/composioIntegration.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function getApiBaseUrl(req) {
  return (process.env.PUBLIC_API_BASE_URL || `${getOrigin(req)}/api`).replace(/\/$/, "");
}

function getFrontendBaseUrl(req) {
  const configured = process.env.AGENCYOS_FRONTEND_URL || process.env.FRONTEND_URL;
  if (configured) return configured.replace(/\/$/, "");

  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/$/, "");

  return "http://localhost:5173";
}

function redirectToClient(req, res, workspaceId, status, message) {
  const url = new URL("/clients", getFrontendBaseUrl(req));
  url.searchParams.set("workspace", workspaceId || "");
  url.searchParams.set("connections", status);
  if (message) url.searchParams.set("message", message);
  res.redirect(url.toString());
}

function redirectToConnections(req, res, status, message) {
  const url = new URL("/clients", getFrontendBaseUrl(req));
  url.searchParams.set("connections", status);
  if (message) url.searchParams.set("message", message);
  res.redirect(url.toString());
}

async function getWorkspace(workspaceId) {
  const result = await getPool().query(
    "SELECT id, client_name FROM workspaces WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
    [workspaceId],
  );
  return result.rows[0] || null;
}

async function listAuthConfigAccounts(composio, composioUserId, authConfigId) {
  const accounts = await composio.connectedAccounts.list({
    userIds: [composioUserId],
    authConfigIds: authConfigId ? [authConfigId] : undefined,
    orderBy: "updated_at",
    limit: 20,
  });
  return accounts.items || [];
}

function getLatestActiveAccount(accounts) {
  return accounts.find((account) => String(account.status || "").toUpperCase() === "ACTIVE") || null;
}

async function deleteStaleAuthConfigAccounts(composio, accounts) {
  const stale = accounts.filter((account) => String(account.status || "").toUpperCase() !== "ACTIVE");
  await Promise.allSettled(stale.map((account) => composio.connectedAccounts.delete(account.id)));
}

function handleError(res, error) {
  const status = error.statusCode || 500;
  const rawMessage = error.message || "Composio integration error";
  const sanitized = rawMessage.replace(/ak_[A-Za-z0-9_-]+/g, (match) => {
    if (match.length <= 10) return "ak_***";
    return `${match.slice(0, 6)}*****`;
  });
  res.status(status).json({ error: sanitized });
}

export async function listComposioIntegrations(req, res) {
  try {
    const { id } = req.params;
    const integrations = await listWorkspaceIntegrations(id);
    const shared = await listSharedIntegrations();
    res.json({
      configured: Boolean(process.env.COMPOSIO_API_KEY),
      toolkits: listSupportedToolkits(),
      composio_user_id: getComposioUserId(id),
      shared_composio_user_id: getSharedComposioUserId(),
      shared,
      integrations,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function listSharedComposioIntegrations(req, res) {
  try {
    res.json({
      configured: Boolean(process.env.COMPOSIO_API_KEY),
      composio_user_id: getSharedComposioUserId(),
      shared: await listSharedIntegrations(),
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function createSharedComposioConnectLink(req, res) {
  try {
    const { toolkit } = req.params;
    const config = getToolkitConfig(toolkit);
    validateAuthConfigId(config);

    const composio = await getComposioClient();
    const composioUserId = getSharedComposioUserId();
    const callbackUrl = `${getApiBaseUrl(req)}/composio/callback?shared=1&toolkit=${encodeURIComponent(toolkit)}`;
    const alias = `Agency Shared ${config.label}`.replace(/\s+/g, " ").slice(0, 120);
    const existingAccounts = await listAuthConfigAccounts(composio, composioUserId, config.authConfigId);
    const activeAccount = getLatestActiveAccount(existingAccounts);

    if (activeAccount) {
      const normalized = normalizeComposioAccount(activeAccount);
      const row = await upsertSharedIntegration(toolkit, {
        composio_user_id: composioUserId,
        auth_config_id: normalized.authConfigId || config.authConfigId,
        connected_account_id: normalized.id,
        status: normalized.status,
        label: normalized.alias || alias,
        last_checked_at: new Date(),
        last_connected_at: normalized.updatedAt || new Date(),
        last_error: normalized.statusReason || null,
      });
      return res.json({
        alreadyConnected: true,
        connected_account_id: normalized.id,
        composio_user_id: composioUserId,
        shared: row,
      });
    }

    await deleteStaleAuthConfigAccounts(composio, existingAccounts);

    const connectionRequest = await composio.connectedAccounts.link(
      composioUserId,
      config.authConfigId,
      { callbackUrl, alias, allowMultiple: true },
    );

    await upsertSharedIntegration(toolkit, {
      composio_user_id: composioUserId,
      auth_config_id: config.authConfigId,
      connection_request_id: connectionRequest.id,
      status: "initiated",
      label: alias,
      last_error: null,
    });

    res.json({
      redirectUrl: connectionRequest.redirectUrl,
      connection_request_id: connectionRequest.id,
      composio_user_id: composioUserId,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function createComposioConnectLink(req, res) {
  try {
    const { id, toolkit } = req.params;
    const workspace = await getWorkspace(id);
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });

    const config = getToolkitConfig(toolkit);
    validateAuthConfigId(config);

    const composio = await getComposioClient();
    const composioUserId = getComposioUserId(id);
    const callbackUrl = `${getApiBaseUrl(req)}/composio/callback?workspace_id=${encodeURIComponent(id)}&toolkit=${encodeURIComponent(toolkit)}`;
    const alias = `${workspace.client_name} ${config.label}`.replace(/\s+/g, " ").slice(0, 120);
    const existingAccounts = await listAuthConfigAccounts(composio, composioUserId, config.authConfigId);
    const activeAccount = getLatestActiveAccount(existingAccounts);

    if (activeAccount) {
      const normalized = normalizeComposioAccount(activeAccount);
      const row = await upsertWorkspaceIntegration(id, toolkit, {
        composio_user_id: composioUserId,
        auth_config_id: normalized.authConfigId || config.authConfigId,
        connected_account_id: normalized.id,
        status: normalized.status,
        label: normalized.alias || alias,
        last_checked_at: new Date(),
        last_connected_at: normalized.updatedAt || new Date(),
        last_error: normalized.statusReason || null,
      });
      return res.json({
        alreadyConnected: true,
        connected_account_id: normalized.id,
        composio_user_id: composioUserId,
        integration: row,
      });
    }

    await deleteStaleAuthConfigAccounts(composio, existingAccounts);

    const connectionRequest = await composio.connectedAccounts.link(
      composioUserId,
      config.authConfigId,
      { callbackUrl, alias, allowMultiple: false },
    );

    await upsertWorkspaceIntegration(id, toolkit, {
      composio_user_id: composioUserId,
      auth_config_id: config.authConfigId,
      connection_request_id: connectionRequest.id,
      status: "initiated",
      label: alias,
      last_error: null,
    });

    res.json({
      redirectUrl: connectionRequest.redirectUrl,
      connection_request_id: connectionRequest.id,
      composio_user_id: composioUserId,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function handleComposioCallback(req, res) {
  const workspaceId = req.query.workspace_id;
  const toolkit = req.query.toolkit;
  const isShared = req.query.shared === "1" || req.query.shared === "true";

  try {
    if (!isShared && (!workspaceId || !UUID_RE.test(workspaceId))) {
      return redirectToClient(req, res, "", "failed", "Invalid workspace");
    }

    const config = getToolkitConfig(toolkit);
    const status = String(req.query.status || "").toLowerCase();
    if (status && status !== "success") {
      const patch = {
        status: "failed",
        last_checked_at: new Date(),
        last_error: req.query.error || req.query.message || "Composio authorization failed",
      };
      if (isShared) await upsertSharedIntegration(toolkit, patch);
      else await upsertWorkspaceIntegration(workspaceId, toolkit, patch);
      return isShared
        ? redirectToConnections(req, res, "failed", "Authorization failed")
        : redirectToClient(req, res, workspaceId, "failed", "Authorization failed");
    }

    const composio = await getComposioClient();
    const composioUserId = isShared ? getSharedComposioUserId() : getComposioUserId(workspaceId);
    const connectedAccountId =
      req.query.connected_account_id ||
      req.query.connectedAccountId ||
      req.query.account_id ||
      req.query.id;

    let account = null;
    if (connectedAccountId) {
      account = await composio.connectedAccounts.get(String(connectedAccountId));
    } else {
      const accounts = await composio.connectedAccounts.list({
        userIds: [composioUserId],
        authConfigIds: config.authConfigId ? [config.authConfigId] : null,
        orderBy: "updated_at",
        limit: 10,
      });
      account = accounts.items?.[0] || null;
    }

    const normalized = normalizeComposioAccount(account);
    if (!normalized?.id) {
      const patch = {
        status: "failed",
        last_checked_at: new Date(),
        last_error: "Composio callback succeeded but no connected account was found",
      };
      if (isShared) await upsertSharedIntegration(toolkit, patch);
      else await upsertWorkspaceIntegration(workspaceId, toolkit, patch);
      return isShared
        ? redirectToConnections(req, res, "failed", "No connected account found")
        : redirectToClient(req, res, workspaceId, "failed", "No connected account found");
    }

    const patch = {
      composio_user_id: composioUserId,
      auth_config_id: normalized.authConfigId || config.authConfigId,
      connected_account_id: normalized.id,
      status: normalized.status,
      label: normalized.alias || normalized.toolkit || config.label,
      last_checked_at: new Date(),
      last_connected_at: new Date(),
      last_error: normalized.statusReason || null,
    };

    if (isShared) {
      await upsertSharedIntegration(toolkit, patch);
      return redirectToConnections(req, res, "success", `${config.label} shared connection added`);
    }

    await upsertWorkspaceIntegration(workspaceId, toolkit, patch);

    redirectToClient(req, res, workspaceId, "success", `${config.label} connected`);
  } catch (error) {
    console.error("[Composio callback] error:", error);
    if (toolkit) {
      const patch = {
        status: "failed",
        last_checked_at: new Date(),
        last_error: error.message || "Callback failed",
      };
      if (isShared) await upsertSharedIntegration(toolkit, patch).catch(() => {});
      else if (workspaceId) await upsertWorkspaceIntegration(workspaceId, toolkit, patch).catch(() => {});
    }
    redirectToClient(req, res, workspaceId || "", "failed", "Callback failed");
  }
}

async function resolveAssetConnection(workspaceId, toolkit, connectedAccountId) {
  if (connectedAccountId) {
    const shared = await getSharedIntegrationByAccount(toolkit, connectedAccountId);
    if (shared) return shared;
    return { connected_account_id: connectedAccountId, composio_user_id: getSharedComposioUserId(), status: "ACTIVE" };
  }

  const current = (await listWorkspaceIntegrations(workspaceId)).find((item) => item.toolkit === toolkit);
  if (current?.connected_account_id) return current;

  const shared = (await listSharedIntegrations()).find((item) => item.toolkit === toolkit)?.connections?.find((conn) => String(conn.status).toUpperCase() === "ACTIVE");
  return shared || null;
}

function sanitizeFacebookPages(payload) {
  const items = payload?.data || payload?.items || payload?.pages || [];
  return Array.isArray(items)
    ? items.map((page) => ({
        type: "facebook_page",
        id: page.id,
        name: page.name,
        category: page.category || null,
        link: page.link || null,
        tasks: Array.isArray(page.tasks) ? page.tasks : [],
        picture_url: page.picture?.data?.url || null,
      }))
    : [];
}

function sanitizeGscSites(payload) {
  const items = payload?.siteEntry || payload?.data?.siteEntry || payload?.sites || payload?.items || payload?.data || [];
  return Array.isArray(items)
    ? items.map((site) => ({
        type: "gsc_property",
        site_url: site.siteUrl || site.site_url || site.url || site.id,
        permission_level: site.permissionLevel || site.permission_level || null,
      })).filter((site) => site.site_url)
    : [];
}

function sanitizeLinkedinCompanies(payload) {
  const items =
    payload?.elements ||
    payload?.data?.elements ||
    payload?.organizations ||
    payload?.companies ||
    payload?.items ||
    payload?.data ||
    [];
  return Array.isArray(items)
    ? items.map((company) => {
        const organization = company.organization || company.localizedName || company;
        const id =
          organization.id ||
          company.organizationId ||
          company.organization_id ||
          String(company.organization || "").replace("urn:li:organization:", "");
        const name =
          organization.localizedName ||
          organization.name ||
          company.localizedName ||
          company.name ||
          company.vanityName ||
          id;
        return {
          type: "linkedin_company",
          id,
          name,
          role: company.role || company.roleAssignee || null,
          state: company.state || null,
          urn: company.organization || organization.urn || (id ? `urn:li:organization:${id}` : null),
        };
      }).filter((company) => company.id || company.name)
    : [];
}

function sanitizeYoutubeChannels(payload) {
  const items = payload?.items || payload?.data?.items || payload?.channels || payload?.data || [];
  return Array.isArray(items)
    ? items.map((channel) => ({
        type: "youtube_channel",
        id: channel.id || channel.channelId || channel.channel_id,
        name: channel.snippet?.title || channel.title || channel.name || channel.id,
        description: channel.snippet?.description || channel.description || null,
        thumbnail_url: channel.snippet?.thumbnails?.default?.url || channel.thumbnail_url || null,
        subscriber_count: channel.statistics?.subscriberCount || channel.subscriber_count || null,
        view_count: channel.statistics?.viewCount || channel.view_count || null,
        video_count: channel.statistics?.videoCount || channel.video_count || null,
      })).filter((channel) => channel.id || channel.name)
    : [];
}

function sanitizeTwitterProfile(payload) {
  const profile = payload?.data?.data || payload?.data || payload?.user || payload;
  if (!profile || typeof profile !== "object" || !profile.id) return [];
  return [{
    type: "twitter_account",
    id: profile.id,
    name: profile.name || profile.username || profile.id,
    username: profile.username || null,
    description: profile.description || null,
    profile_image_url: profile.profile_image_url || null,
    public_metrics: profile.public_metrics || null,
    link: profile.username ? `https://x.com/${profile.username}` : null,
  }];
}

function sanitizeAssets(toolkit, payload) {
  if (toolkit === "facebook") return sanitizeFacebookPages(payload);
  if (toolkit === "google_search_console") return sanitizeGscSites(payload);
  if (toolkit === "linkedin") return sanitizeLinkedinCompanies(payload);
  if (toolkit === "youtube") return sanitizeYoutubeChannels(payload);
  if (toolkit === "twitter") return sanitizeTwitterProfile(payload);
  return [];
}

export async function fetchComposioAssets(req, res) {
  try {
    const { id, toolkit } = req.params;
    const { connected_account_id } = req.query;
    const connection = await resolveAssetConnection(id, toolkit, connected_account_id);
    if (!connection?.connected_account_id) {
      return res.status(404).json({ error: "No active connection found for this toolkit" });
    }

    const composio = await getComposioClient();
    let toolSlug;
    let args;
    let version;
    if (toolkit === "facebook") {
      toolSlug = "FACEBOOK_LIST_MANAGED_PAGES";
      version = "20260523_00";
      args = {
        user_id: "me",
        limit: 100,
        fields: "id,name,category,tasks,about,link,picture",
      };
    } else if (toolkit === "google_search_console") {
      toolSlug = "GOOGLE_SEARCH_CONSOLE_LIST_SITES";
      version = "20260523_00";
      args = {};
    } else if (toolkit === "linkedin") {
      toolSlug = "LINKEDIN_GET_COMPANY_INFO";
      version = "20260424_00";
      args = { role: "ADMINISTRATOR", state: "APPROVED", count: 100, start: 0 };
    } else if (toolkit === "youtube") {
      toolSlug = "YOUTUBE_GET_CHANNEL_STATISTICS";
      version = "20260429_00";
      args = { mine: true, part: "snippet,statistics" };
    } else if (toolkit === "twitter") {
      toolSlug = "TWITTER_USER_LOOKUP_ME";
      version = "20260525_00";
      args = {
        user_fields: ["created_at", "description", "profile_image_url", "public_metrics", "url", "verified"],
      };
    } else {
      return res.status(400).json({
        error: "Asset fetching is supported for Facebook, Google Search Console, LinkedIn, YouTube, and Twitter / X",
      });
    }

    const result = await composio.tools.execute(toolSlug, {
      userId: connection.composio_user_id || getSharedComposioUserId(),
      connectedAccountId: connection.connected_account_id,
      version,
      arguments: args,
    });

    const payload = result?.data ?? result;
    const assets = sanitizeAssets(toolkit, payload);
    res.json({
      toolkit,
      connected_account_id: connection.connected_account_id,
      tool: toolSlug,
      count: assets.length,
      assets,
      paging: payload?.paging ? { next: Boolean(payload.paging.next) } : null,
      logId: result?.logId || result?.log_id || null,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function saveWorkspaceAssetMapping(req, res) {
  try {
    const { id, toolkit } = req.params;
    const { connected_account_id, selected_resource, label } = req.body || {};
    if (!connected_account_id) return res.status(400).json({ error: "connected_account_id is required" });
    if (!selected_resource || typeof selected_resource !== "object") {
      return res.status(400).json({ error: "selected_resource object is required" });
    }

    const shared = await getSharedIntegrationByAccount(toolkit, connected_account_id);
    const row = await upsertWorkspaceIntegration(id, toolkit, {
      composio_user_id: shared?.composio_user_id || getSharedComposioUserId(),
      auth_config_id: shared?.auth_config_id || getToolkitConfig(toolkit).authConfigId,
      connected_account_id,
      status: "ACTIVE",
      label: label || shared?.label || getToolkitConfig(toolkit).label,
      selected_resource,
      latest_summary: {
        mapped_at: new Date().toISOString(),
        selected_resource,
      },
      last_checked_at: new Date(),
      last_sync_at: new Date(),
      last_error: null,
    });

    res.json({ integration: row });
  } catch (error) {
    handleError(res, error);
  }
}

export async function promoteWorkspaceIntegrationToShared(req, res) {
  try {
    const { id, toolkit } = req.params;
    const current = (await listWorkspaceIntegrations(id)).find((item) => item.toolkit === toolkit);
    if (!current?.connected_account_id) {
      return res.status(404).json({ error: "No workspace connection found to share" });
    }

    const row = await upsertSharedIntegration(toolkit, {
      composio_user_id: current.composio_user_id || getComposioUserId(id),
      auth_config_id: current.auth_config_id,
      connected_account_id: current.connected_account_id,
      connection_request_id: current.connection_request_id,
      status: current.status,
      label: current.label || `${toolkit} shared connection`,
      last_checked_at: new Date(),
      last_connected_at: current.last_connected_at || new Date(),
      last_error: current.last_error || null,
    });

    res.json({ shared: row });
  } catch (error) {
    handleError(res, error);
  }
}

export async function refreshComposioIntegration(req, res) {
  try {
    const { id, toolkit } = req.params;
    getToolkitConfig(toolkit);

    const current = (await listWorkspaceIntegrations(id)).find((item) => item.toolkit === toolkit);
    if (!current?.connected_account_id) {
      return res.status(404).json({ error: "No connected account saved for this toolkit" });
    }

    const composio = await getComposioClient();
    const account = await composio.connectedAccounts.get(current.connected_account_id);
    const normalized = normalizeComposioAccount(account);

    const row = await upsertWorkspaceIntegration(id, toolkit, {
      connected_account_id: normalized.id,
      auth_config_id: normalized.authConfigId || current.auth_config_id,
      status: normalized.status,
      label: normalized.alias || current.label,
      last_checked_at: new Date(),
      last_error: normalized.statusReason || null,
    });

    res.json({ integration: row, account: normalized });
  } catch (error) {
    handleError(res, error);
  }
}

export async function disconnectComposioIntegration(req, res) {
  try {
    const { id, toolkit } = req.params;
    const { deleteRemote = false } = req.body || {};
    const current = (await listWorkspaceIntegrations(id)).find((item) => item.toolkit === toolkit);

    if (deleteRemote && current?.connected_account_id) {
      const composio = await getComposioClient();
      await composio.connectedAccounts.delete(current.connected_account_id);
    }

    const integration = await clearWorkspaceIntegration(id, toolkit);
    res.json({ success: true, integration });
  } catch (error) {
    handleError(res, error);
  }
}

export async function updateComposioIntegrationSummary(req, res) {
  try {
    const { id, toolkit } = req.params;
    getToolkitConfig(toolkit);
    const { latest_summary, selected_resource, status, last_error } = req.body || {};

    const row = await upsertWorkspaceIntegration(id, toolkit, {
      latest_summary: latest_summary && typeof latest_summary === "object" ? latest_summary : undefined,
      selected_resource: selected_resource && typeof selected_resource === "object" ? selected_resource : undefined,
      status,
      last_error: last_error ?? null,
      last_sync_at: new Date(),
      last_checked_at: new Date(),
    });

    res.json({ integration: row });
  } catch (error) {
    handleError(res, error);
  }
}

export async function getAgentComposioContext(req, res) {
  try {
    const { id } = req.params;
    const workspace = await getWorkspace(id);
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });

    const integrations = await listWorkspaceIntegrations(id);
    const activeConnections = integrations
      .filter((item) => item.connected_account_id && String(item.status).toUpperCase() === "ACTIVE")
      .map((item) => ({
        toolkit: item.toolkit,
        label: item.label || item.toolkit,
        connected_account_id: item.connected_account_id,
        auth_config_id: item.auth_config_id,
        selected_resource: item.selected_resource,
        latest_summary: item.latest_summary,
        read_only_use: item.readOnlyUse,
      }));

    res.json({
      workspace: {
        id: workspace.id,
        client_name: workspace.client_name,
      },
      composio: {
        user_id: getComposioUserId(id),
        mode: "read_only",
        connected_accounts: activeConnections,
      },
      rules: [
        "Use these Composio accounts for read-only research only.",
        "Do not publish, mutate external accounts, delete, schedule, or change permissions.",
        "Store only summaries/status back in AgencyOS; keep structured client truth in Notion.",
      ],
      docs: {
        local: "agencyOS/AGENCYOS_COMPOSIO_AGENT_GUIDE.md",
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}
