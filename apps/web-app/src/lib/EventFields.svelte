<script lang="ts">
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import { EVENT_KINDS } from "./format.ts";

  /** The fields of an event, shared by the creation and the settings forms. */
  let {
    values = null,
    error = null,
    frozen = false,
  }: {
    values?: { name: string; kind: string; date: string; revealDelayDays: number | string } | null;
    error?: string | null;
    /** Once the secret is lifted, the date and the delay no longer change. */
    frozen?: boolean;
  } = $props();

  const i18n = useI18n();
  const all = $derived(appMessages(i18n.locale));
  const m = $derived(all.eventFields);
  const field = (name: string) => (error === `invalid_${name}` ? "true" : undefined);
</script>

{#if error}
  <p class="notice error" role="alert">{m.errors[error] ?? m.failed}</p>
{/if}
<div class="fields">
  <div class="wide">
    <label for="event-name">{m.name}</label>
    <input
      id="event-name"
      name="name"
      required
      maxlength="100"
      placeholder={m.namePlaceholder}
      value={values?.name ?? ""}
      aria-invalid={field("name")}
    />
  </div>
  <div>
    <label for="event-kind">{m.kind}</label>
    <select id="event-kind" name="kind">
      {#each EVENT_KINDS as kind (kind)}
        <option value={kind} selected={(values?.kind ?? "other") === kind}>{all.eventKinds[kind]}</option>
      {/each}
    </select>
  </div>
  <div>
    <label for="event-date">{m.date}</label>
    <input
      id="event-date"
      name="date"
      type="date"
      required
      readonly={frozen}
      value={values?.date ?? ""}
      aria-invalid={field("date")}
    />
  </div>
  <div class="wide">
    <label for="event-delay">{m.delay}</label>
    <div class="delay">
      <input
        id="event-delay"
        name="revealDelayDays"
        type="number"
        inputmode="numeric"
        min="0"
        max="365"
        required
        readonly={frozen}
        value={values?.revealDelayDays ?? 3}
        aria-describedby="event-delay-aide"
        aria-invalid={field("delay")}
      />
      <span>{m.delayUnit}</span>
    </div>
    <p id="event-delay-aide" class="muted help">
      {frozen ? m.frozen : m.delayHelp}
    </p>
  </div>
</div>

<style>
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .delay {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .delay input {
    width: 6rem;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.4rem 0 0;
  }
  .notice {
    margin: 0 0 1rem;
  }
  @media (max-width: 30rem) {
    .fields {
      grid-template-columns: 1fr;
    }
  }
</style>
