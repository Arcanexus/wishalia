# Configuration

Every setting comes from an environment variable. The chart sets the non-sensitive ones through a
ConfigMap and loads the sensitive ones from `existingSecret`. Nothing is hard-coded.

## Set by the chart

| Variable      | Components          | Value                                                                                 |
| ------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `APP_NAME`    | all                 | `config.appName`: the product name shown to people.                                   |
| `LOG_LEVEL`   | api                 | `config.logLevel`: `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`.    |
| `PORT`        | all                 | The port of the component (3000 in the images).                                       |
| `ORIGIN`      | web-app, web-public | `https://` + the host of the frontend. SvelteKit checks form posts against it (CSRF). |
| `API_URL`     | web-app, web-public | Internal URL of the API Service.                                                      |
| `APP_VERSION` | all                 | Set in the image from the release tag, shown by `/healthz`.                           |

## In the Secret

| Key                                                          | Used from         | Content                                       |
| ------------------------------------------------------------ | ----------------- | --------------------------------------------- |
| `DATABASE_URL`                                               | the migration Job | `postgres://user:password@host:5432/database` |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | the media step    | The S3 bucket of the images.                  |

The auth secrets join this table with the auth step. The API refuses to start when a variable is
invalid, and lists every problem at once.
