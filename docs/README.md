# wishlist documentation

wishlist is a self-hosted wishlist app for a family: several lists, recurring events (birthdays,
Christmas), gifts that several people chip in for, and a strict **anti-spoil** rule. The owner of a
list never sees who gave what, until they choose to lift the secret after the event.

> wishlist is the code name. The product name is set by configuration (`APP_NAME`).

| I want to                       | Read                                                               |
| ------------------------------- | ------------------------------------------------------------------ |
| Run it on my machine            | [Quick start](quick-start.md)                                      |
| Deploy it on Kubernetes         | [Installation](installation.md)                                    |
| Set a variable or a chart value | [Configuration](configuration.md), [Chart values](chart-values.md) |
| Understand the security model   | [Security](security.md)                                            |
| Understand how it is built      | [Architecture](architecture.md)                                    |
| Contribute                      | [Development](development.md)                                      |

The project is at its foundation stage: the four components start, answer their health probes and
ship as images and a Helm chart. The data model, the API and the screens come next.
