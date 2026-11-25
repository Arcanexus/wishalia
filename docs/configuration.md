# Configuration

Every setting comes from an environment variable. The chart sets the non-sensitive ones through a
ConfigMap and loads the sensitive ones from `existingSecret`. Nothing is hard-coded.

## Set by the chart

| Variable                                | Components          | Value                                                                                                                                                                          |
| --------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_NAME`                              | all                 | `config.appName`: the product name shown to people.                                                                                                                            |
| `DEFAULT_LOCALE`                        | all                 | `config.defaultLocale`: `fr` (default) or `en`, the language for a browser that asks for none Wishalia speaks ([Languages](i18n.md)).                                          |
| `LOG_LEVEL`                             | api                 | `config.logLevel`: `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`.                                                                                             |
| `PORT`                                  | all                 | The port of the component (3000 in the images).                                                                                                                                |
| `ORIGIN`                                | web-app, web-public | `https://` + the host of the frontend. SvelteKit checks form posts against it (CSRF).                                                                                          |
| `API_URL`                               | web-app, web-public | Internal URL of the API Service.                                                                                                                                               |
| `METRICS_PORT`                          | all                 | `metrics.port` when `metrics.enabled`: the port of `/metrics`. Off (0) when unset.                                                                                             |
| `APP_ORIGIN`, `PUBLIC_ORIGIN`           | all                 | `https://` + `hosts.app` and `hosts.public`. Must differ; https in production.                                                                                                 |
| `API_ORIGIN`                            | api                 | `https://` + `hosts.api`: the REST API v1, on its own host. Unset: the API v1 is off.                                                                                          |
| `API_RATE_LIMIT`                        | api                 | `apiV1.rateLimit`: requests a minute and per token on the API v1 (120).                                                                                                        |
| `COOKIE_DOMAIN`                         | api                 | `auth.cookieDomain`, by default `hosts.public` when `hosts.app` is under it: one session for both hosts.                                                                       |
| `OWNER_EMAILS`                          | api                 | `auth.ownerEmails`: who may create an account by themselves. Everyone else is invited.                                                                                         |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`         | api, web-app        | `auth.oidc.*`: the OIDC provider of the owners. Callback URL: `https://<hosts.app>/auth/callback/oidc`. The management app shows its sign-in button when `OIDC_ISSUER` is set. |
| `OIDC_NAME`                             | web-app             | `auth.oidc.name`: the provider's name on the sign-in button, « Se connecter avec … » (`SSO`).                                                                                  |
| `MAIL_FROM`                             | api                 | `auth.mailFrom`: sender of the magic links.                                                                                                                                    |
| `IMAGE_STORAGE`                         | api, worker         | `images.storage` when `images.enabled`: `volume` or `s3`, where the image files live ([Images](images.md)).                                                                    |
| `IMAGE_DIR`                             | api, worker         | With `volume`: the folder of the files, `/data/images` in the chart (imgproxy's `IMGPROXY_LOCAL_FILESYSTEM_ROOT`).                                                             |
| `IMAGE_CLEANUP_INTERVAL_HOURS`          | worker              | Hours between two sweeps of the unused image files, `6` by default; `0`: never ([Images](images.md#unused-files)).                                                             |
| `IMAGE_CLEANUP_GRACE_HOURS`             | worker              | A file younger than this is never removed by the sweep, `24` by default (1 at least).                                                                                          |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | api, worker         | With `s3`: `images.s3.*`, the bucket of the images.                                                                                                                            |
| `IMGPROXY_URL`                          | web-app, web-public | When `images.enabled`: the internal URL of imgproxy, whose thumbnails the frontends serve under `/img/`.                                                                       |
| `BODY_SIZE_LIMIT`                       | web-app             | `images.uploadLimit` (`12M`) when `images.enabled`, else `3M`: the largest form, for the images the owner sends and the imported lists.                                        |
| `APP_VERSION`                           | all                 | Set in the image from the release tag, shown by `/healthz`.                                                                                                                    |

## In the Secret

| Key                              | Used from                              | Content                                                                                                                                                           |
| -------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | the API, the worker, the migration Job | `postgres://user:password@host:5432/database`. Only with your own database (`postgresql.enabled=false`); the built-in one is wired by the chart.                  |
| `AUTH_SECRET`                    | the API                                | 32 random characters or more (`openssl rand -base64 32`): signs the session cookies and the device marker, encrypts the OAuth tokens. Required in production.     |
| `OIDC_CLIENT_SECRET`             | the API                                | Client secret of the OIDC provider, with `auth.oidc.*`.                                                                                                           |
| `SMTP_URL`                       | the API                                | `smtp://user:password@host:587` (STARTTLS) or `smtps://...:465`. Unset: no magic links, passkeys and OIDC only.                                                   |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | the API, the worker, imgproxy          | The keys of the images' bucket, with `images.storage: s3`.                                                                                                        |
| `IMGPROXY_KEY`, `IMGPROXY_SALT`  | the API, imgproxy                      | Hex, 32 characters or more each (`openssl rand -hex 32`): the API signs the thumbnail paths, imgproxy checks them.                                                |
| `GARAGE_ADMIN_TOKEN`             | Garage, its console                    | With `images.garage.ui.enabled`: hex, 64 characters (`openssl rand -hex 32`), Garage's administration token.                                                      |
| `GARAGE_UI_OIDC_CLIENT_SECRET`   | the Garage console                     | With `images.garage.ui.oidc.enabled`: the client secret of the console at your OIDC provider.                                                                     |
| `GARAGE_RPC_SECRET`              | Garage                                 | With `images.garage.enabled`: hex, 64 characters (`openssl rand -hex 32`). `S3_ACCESS_KEY` is then `GK` and 32 hex characters, `S3_SECRET_KEY` 64 hex characters. |

The API refuses to start when a variable is invalid, and lists every problem at once.

## Images

The image settings go together: all unset, the items have no image; half set, the API and the worker
refuse to start and say what is missing.

- `IMAGE_STORAGE=volume`: `IMAGE_DIR` (an absolute path), `IMGPROXY_KEY`, `IMGPROXY_SALT`. imgproxy
  reads the same folder (`IMGPROXY_LOCAL_FILESYSTEM_ROOT`, `IMGPROXY_ALLOWED_SOURCES=local:///`).
- `IMAGE_STORAGE=s3`, the default when an `S3_*` variable is set: `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `IMGPROXY_KEY`, `IMGPROXY_SALT`, and `S3_REGION` (`us-east-1` by
  default). The bucket is addressed in path style (`<endpoint>/<bucket>/<key>`), as MinIO wants it.

See [Images](images.md).
