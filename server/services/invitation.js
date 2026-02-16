import { getPool } from '../db/index.js';
import crypto from 'crypto';

export async function createInvitation(workspaceId, createdBy, maxUses = 0, expiresInHours = 0) {
  const code = crypto.randomBytes(16).toString('hex');
  const expiresAt = expiresInHours > 0
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
    : null;

  const result = await getPool().query(
    `INSERT INTO invitations (code, workspace_id, created_by, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [code, workspaceId, createdBy, maxUses, expiresAt]
  );
  return result.rows[0];
}

export async function getInvitationByCode(code) {
  const result = await getPool().query(
    `SELECT i.*, w.bucket, w.client_name
     FROM invitations i
     JOIN workspaces w ON i.workspace_id = w.id
     WHERE i.code = $1 AND i.active = TRUE`,
    [code]
  );

  const invitation = result.rows[0];
  if (!invitation) return null;

  // Check expiration
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    return null;
  }

  // Check max uses
  if (invitation.max_uses > 0 && invitation.use_count >= invitation.max_uses) {
    return null;
  }

  return invitation;
}

export async function useInvitation(code) {
  await getPool().query(
    `UPDATE invitations SET use_count = use_count + 1 WHERE code = $1`,
    [code]
  );
}

export async function getWorkspaceInvitations(workspaceId) {
  const result = await getPool().query(
    `SELECT i.*, u.name as created_by_name
     FROM invitations i
     LEFT JOIN users u ON i.created_by = u.id
     WHERE i.workspace_id = $1
     ORDER BY i.created_at DESC`,
    [workspaceId]
  );
  return result.rows;
}

export async function deactivateInvitation(id) {
  await getPool().query(
    'UPDATE invitations SET active = FALSE WHERE id = $1',
    [id]
  );
}
