import getPool from "../db/index.js";

// Cast note_date to TEXT so the pg driver returns 'YYYY-MM-DD' strings
// instead of JS Date objects (which shift the day due to timezone conversion).
const DATE_COL = "TO_CHAR(cn.note_date, 'YYYY-MM-DD') AS note_date";

export async function getCalendarNotes(workspaceBucket, year, month) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const result = await getPool().query(
    `SELECT cn.id, cn.workspace_bucket, cn.video_id, ${DATE_COL},
            cn.note_time, cn.title, cn.content, cn.color,
            cn.created_by, cn.created_at, cn.updated_at,
            u.name AS created_by_name, v.filename AS video_filename
     FROM calendar_notes cn
     LEFT JOIN users u ON cn.created_by = u.id
     LEFT JOIN videos v ON cn.video_id = v.id
     WHERE cn.workspace_bucket = $1
       AND cn.note_date BETWEEN $2 AND $3
     ORDER BY cn.note_date ASC, cn.note_time ASC NULLS LAST, cn.created_at ASC`,
    [workspaceBucket, startDate, endDate],
  );
  return result.rows;
}

export async function createCalendarNote(data) {
  const { workspaceBucket, videoId, noteDate, noteTime, title, content, color, createdBy } = data;

  const result = await getPool().query(
    `INSERT INTO calendar_notes (workspace_bucket, video_id, note_date, note_time, title, content, color, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, workspace_bucket, video_id,
               TO_CHAR(note_date, 'YYYY-MM-DD') AS note_date,
               note_time, title, content, color,
               created_by, created_at, updated_at`,
    [workspaceBucket, videoId || null, noteDate, noteTime || null, title, content || null, color || "blue", createdBy],
  );

  const note = result.rows[0];
  const user = await getPool().query("SELECT name FROM users WHERE id = $1", [createdBy]);
  note.created_by_name = user.rows[0]?.name || null;

  if (note.video_id) {
    const video = await getPool().query("SELECT filename FROM videos WHERE id = $1", [note.video_id]);
    note.video_filename = video.rows[0]?.filename || null;
  } else {
    note.video_filename = null;
  }

  return note;
}

export async function updateCalendarNote(id, data) {
  const { title, content, noteDate, noteTime, color, videoId } = data;

  const result = await getPool().query(
    `UPDATE calendar_notes
     SET title = COALESCE($2, title),
         content = COALESCE($3, content),
         note_date = COALESCE($4, note_date),
         note_time = $5,
         color = COALESCE($6, color),
         video_id = $7,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, workspace_bucket, video_id,
               TO_CHAR(note_date, 'YYYY-MM-DD') AS note_date,
               note_time, title, content, color,
               created_by, created_at, updated_at`,
    [id, title, content, noteDate, noteTime, color, videoId],
  );

  const note = result.rows[0];
  if (!note) return null;

  const user = await getPool().query("SELECT name FROM users WHERE id = $1", [note.created_by]);
  note.created_by_name = user.rows[0]?.name || null;

  if (note.video_id) {
    const video = await getPool().query("SELECT filename FROM videos WHERE id = $1", [note.video_id]);
    note.video_filename = video.rows[0]?.filename || null;
  } else {
    note.video_filename = null;
  }

  return note;
}

export async function deleteCalendarNote(id) {
  const result = await getPool().query(
    "DELETE FROM calendar_notes WHERE id = $1 RETURNING id",
    [id],
  );
  return result.rows[0];
}

export async function getCalendarNoteById(id) {
  const result = await getPool().query(
    "SELECT * FROM calendar_notes WHERE id = $1",
    [id],
  );
  return result.rows[0];
}
