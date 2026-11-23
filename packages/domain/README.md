# @wishlist/domain

Pure business rules, with no I/O: no database, no HTTP, no clock read behind your back. Every rule
here is covered by Vitest. The anti-spoil rule (`canSeeContributions`) lives here, as the single
function every API calls.

| Module          | Content                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| `money.ts`      | Amounts in cents (`Cents`), parsing what people type (`12,50`), sums, display.                |
| `funding.ts`    | Totals, remaining, overshoot, segments per event, item states. Never stored, always computed. |
| `anti-spoil.ts` | Who is looking, when the secret can be lifted, who may see the contributions and the history. |
