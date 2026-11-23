# Wishalia documentation

Wishalia is a self-hosted wishlist app for a family: several lists, recurring events (birthdays,
Christmas), gifts that several people chip in for, and a strict **anti-spoil** rule. The owner of a
list never sees who gave what, until they choose to lift the secret after the event.

> The name shown to people comes from `APP_NAME` (`Wishalia` by default). Logo, colours and fonts:
> [Branding](branding.md).

| I want to                       | Read                                                               |
| ------------------------------- | ------------------------------------------------------------------ |
| Run it on my machine            | [Quick start](quick-start.md)                                      |
| Deploy it on Kubernetes         | [Installation](installation.md)                                    |
| Set a variable or a chart value | [Configuration](configuration.md), [Chart values](chart-values.md) |
| Understand the security model   | [Security](security.md)                                            |
| Understand how it is built      | [Architecture](architecture.md), [Data model](data-model.md)       |
| Use the logo or the colours     | [Branding](branding.md)                                            |
| Contribute                      | [Development](development.md)                                      |

The project is at its foundation stage: the four components ship as images and a Helm chart, and the
data model and the business rules (funding, anti-spoil) are in place. The API and the screens come
next.
