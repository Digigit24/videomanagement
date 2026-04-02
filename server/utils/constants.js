// Video approval statuses
export const VIDEO_STATUS = {
  DRAFT: "Draft",
  PENDING: "Pending",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  CHANGES_NEEDED: "Changes Needed",
  REJECTED: "Rejected",
  POSTED: "Posted",
};

export const VALID_VIDEO_STATUSES = Object.values(VIDEO_STATUS);

// Comment marker statuses
export const MARKER_STATUS = {
  PENDING: "pending",
  WORKING: "working",
  DONE: "done",
};

export const VALID_MARKER_STATUSES = Object.values(MARKER_STATUS);

// Processing statuses
export const PROCESSING_STATUS = {
  QUEUED: "queued",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
};

// Media types
export const MEDIA_TYPE = {
  VIDEO: "video",
  PHOTO: "photo",
};
