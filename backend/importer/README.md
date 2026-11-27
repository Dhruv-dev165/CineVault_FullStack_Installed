# CineVault Automatic Movie Import

This importer is a configurable integration scaffold for a movie server that you own or are licensed to use. The actual source protocol is not known yet, so the worker expects a simple HTTPS JSON feed. It does not scrape public movie-download sites, defeat DRM, or copy content from sites without permission.

## Feed contract

Set `MOVIE_IMPORT_FEED_URL` to an HTTPS endpoint returning either a JSON array or `{ "movies": [...] }`. Each item needs a stable `id` (or `sourceId`), a `title`, and at least one authorized video URL in `videoUrl`, `video_url`, `fileUrl`, or `links`.

Supported optional metadata: `category`/`genre`, `year`, `language`, `quality`/`qualityTag`, `size`, `poster`, and `description`/`synopsis`.

See `movie-feed.example.json` for a sample. Video assets must be reachable by HTTPS and respond to HEAD with a video content type or a recognizable video extension. The worker stores remote video URLs; it does not download large files onto Render's ephemeral filesystem.

## Render setup

Create a separate **Background Worker** service in the same Render workspace:
- Repository: `Dhruv-dev165/CineVault_FullStack_Installed`
- Branch: `feature/automatic-movie-import` (after merging the PR, use `main`)
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm run import:worker`

Set these environment variables on the worker:
- `MONGO_URI` (or `MONGODB_URI`): same MongoDB Atlas connection string used by the API
- `MONGODB_DB_NAME`: `cinevault` (or your actual database name)
- `MOVIE_IMPORT_FEED_URL`: HTTPS JSON feed URL from your authorized server
- `MOVIE_IMPORT_TOKEN`: optional bearer token for the feed
- `MOVIE_IMPORT_INTERVAL_SECONDS`: optional; default 300, minimum 60

Do not put credentials in the feed URL or commit secrets to GitHub. Restrict the feed token to read-only access. Allow the Render worker's outbound IP/network access in your source server as needed. The worker and API should use the same MongoDB database and `movies` collection.

## Behavior and limitations

- Polls immediately on startup, then at the configured interval.
- Upserts by a stable source ID hash to prevent duplicate imports.
- Publishes automatically after at least one video URL passes the availability/type check.
- Keeps movie metadata and remote video links in MongoDB; video bytes remain on your authorized media host/object storage.
- Import errors are logged in Render worker logs. A later dashboard/history endpoint can be added once the source format and admin UI are confirmed.
- Current importer maps the first-party metadata fields used by the existing CineVault API. Confirm your frontend's playback code supports the `links` keys supplied by your feed before enabling live imports.

## Important before activation

The source URL and feed format are not yet known. Until you receive them from your server provider, the worker cannot connect or import real movies. Deploying this scaffold without `MOVIE_IMPORT_FEED_URL` will intentionally fail fast rather than inventing a source.
