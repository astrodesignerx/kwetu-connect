-- Rulebook section 9: MP4 video, PNG or JPEG stills, up to 50 MB.
-- Run after 0001. Changes only the adverts bucket limits.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['video/mp4', 'image/png', 'image/jpeg']
where id = 'adverts';
