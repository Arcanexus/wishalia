# Configuration

Every setting comes from an environment variable. The chart sets the non-sensitive ones through a
ConfigMap and loads the sensitive ones from `existingSecret`. Nothing is hard-coded.

## Set by the chart

| Variable                        | Components          | Value                                                                                                          |
| ------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `APP_NAME`                      | all                 | `config.appName`: the product name shown to people.                                                            |
| `LOG_LEVEL`                     | api                 | `config.logLevel`: `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`.                             |
| `PORT`                          | all                 | The port of the component (3000 in the images).                                                                |
| `ORIGIN`                        | web-app, web-public | `https://` + the host of the frontend. SvelteKit checks form posts against it (CSRF).                          |
| `API_URL`                       | web-app, web-public | Internal URL of the API Service.                                                                               |
| `METRICS_PORT`                  | all                 | `metrics.port` when `metrics.enabled`: the port of `/metrics`. Off (0) when unset.                             |
| `APP_ORIGIN`, `PUBLIC_ORIGIN`   | all                 | `https://` + `hosts.app` and `hosts.public`. Must differ; https in production.                                 |
| `COOKIE_DOMAIN`                 | api                 | `auth.cookieDomain`, by default `hosts.public` when `hosts.app` is under it: one session for both hosts.       |
| `OWNER_EMAILS`                  | api                 | `auth.ownerEmails`: who may create an account by themselves. Everyone else is invited.                         |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID` | api                 | `auth.oidc.*`: the OIDC provider of the owners. Callback URL: `https://<hosts.app>/auth/oauth2/callback/oidc`. |
| `MAIL_FROM`                     | api                 | `auth.mailFrom`: sender of the magic links.                                                                    |
| `APP_VERSION`                   | all                 | Set in the image from the release tag, shown by `/healthz`.                                                    |

## In the Secret

| Key                                                          | Used from                  | Content                                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                               | the API, the migration Job | `postgres://user:password@host:5432/database`                                                                                                                 |
| `AUTH_SECRET`                                                | the API                    | 32 random characters or more (`openssl rand -base64 32`): signs the session cookies and the device marker, encrypts the OAuth tokens. Required in production. |
| `OIDC_CLIENT_SECRET`                                         | the API                    | Client secret of the OIDC provider, with `auth.oidc.*`.                                                                                                       |
| `SMTP_URL`                                                   | the API                    | `smtp://user:password@host:587` (STARTTLS) or `smtps://...:465`. Unset: no magic links, passkeys and OIDC only.                                               |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | the media step             | The S3 bucket of the images.                                                                                                                                  |

The API refuses to start when a variable is invalid, and lists every problem at once.
