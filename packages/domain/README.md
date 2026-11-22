# @wishlist/domain

Pure business rules, with no I/O: no database, no HTTP, no clock read behind your back. Every rule
here is covered by Vitest, and the anti-spoil rule (`canSeeContributions`, coming with the data model)
will live here, as the single function every API calls.

| Module     | Content                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `money.ts` | Amounts in cents (`Cents`), parsing what people type (`12,50`), sums, display. |
