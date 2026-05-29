-- Make the `uploads` bucket private so player photos / team logos are no longer
-- world-readable via permanent public URLs. Admin reads (thumbnails + Excel export)
-- now go through short-lived signed URLs generated server-side with the service role.

UPDATE storage.buckets SET public = false WHERE id = 'uploads';
