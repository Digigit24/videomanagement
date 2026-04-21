import {
  getCalendarNotes,
  createCalendarNote,
  updateCalendarNote,
  deleteCalendarNote,
  getCalendarNoteById,
} from "../services/calendarNote.js";

export async function listNotes(req, res) {
  try {
    const { bucket } = req.query;
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);

    if (!bucket || !year || !month) {
      return res.status(400).json({ error: "bucket, year, and month are required" });
    }

    const notes = await getCalendarNotes(bucket, year, month);
    res.json({ notes });
  } catch (error) {
    console.error("Failed to list calendar notes:", error);
    res.status(500).json({ error: "Failed to list calendar notes" });
  }
}

export async function addNote(req, res) {
  try {
    const { bucket, videoId, noteDate, noteTime, title, content, color } = req.body;

    if (!bucket || !noteDate || !title) {
      return res.status(400).json({ error: "bucket, noteDate, and title are required" });
    }

    const note = await createCalendarNote({
      workspaceBucket: bucket,
      videoId,
      noteDate,
      noteTime,
      title,
      content,
      color,
      createdBy: req.user.id,
    });

    res.status(201).json({ note });
  } catch (error) {
    console.error("Failed to create calendar note:", error);
    res.status(500).json({ error: "Failed to create calendar note" });
  }
}

export async function editNote(req, res) {
  try {
    const { id } = req.params;
    const existing = await getCalendarNoteById(id);
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    const note = await updateCalendarNote(id, req.body);
    res.json({ note });
  } catch (error) {
    console.error("Failed to update calendar note:", error);
    res.status(500).json({ error: "Failed to update calendar note" });
  }
}

export async function removeNote(req, res) {
  try {
    const { id } = req.params;
    const existing = await getCalendarNoteById(id);
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    await deleteCalendarNote(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete calendar note:", error);
    res.status(500).json({ error: "Failed to delete calendar note" });
  }
}
