# @wishalia/storage

The images of the items ([docs/images.md](../../docs/images.md)), for the API, the worker and the two
frontends:

- `s3Storage`: the S3 bucket (MinIO), path style, signed with SigV4 (`aws4fetch`); `memoryStorage`
  for the tests.
- `sniffImage`: what a file really is, from its first bytes (JPEG, PNG, WebP, GIF, AVIF, HEIC; never
  SVG), and its size.
- `imagePath`, `imageSources`: the signed imgproxy paths of the three sizes, with the owner's frame.
- `proxyImage`: what the frontends answer under `/img/`.
- `imageSettingsFromEnv`: the settings, all or nothing.
