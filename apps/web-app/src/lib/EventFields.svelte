<script lang="ts">
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

  const messages: Record<string, string> = {
    invalid_name: "Donnez un nom à l'événement, en 100 caractères au plus.",
    invalid_date: "Choisissez la date de l'événement.",
    invalid_delay: "Le délai est un nombre de jours, de 0 à 365.",
    secret_already_lifted: "Le secret est levé : la date et le délai ne changent plus.",
  };
  const field = (name: string) => (error === `invalid_${name}` ? "true" : undefined);
</script>

{#if error}
  <p class="notice error" role="alert">{messages[error] ?? "L'enregistrement n'a pas abouti. Réessayez."}</p>
{/if}
<div class="fields">
  <div class="wide">
    <label for="event-name">Nom</label>
    <input
      id="event-name"
      name="name"
      required
      maxlength="100"
      placeholder="Par exemple « Les 8 ans de Léa »"
      value={values?.name ?? ""}
      aria-invalid={field("name")}
    />
  </div>
  <div>
    <label for="event-kind">Type</label>
    <select id="event-kind" name="kind">
      {#each EVENT_KINDS as kind (kind.value)}
        <option value={kind.value} selected={(values?.kind ?? "other") === kind.value}>{kind.label}</option>
      {/each}
    </select>
  </div>
  <div>
    <label for="event-date">Date</label>
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
    <label for="event-delay">Lever le secret au plus tôt</label>
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
      <span>jours après l'événement</span>
    </div>
    <p id="event-delay-aide" class="muted help">
      {frozen
        ? "Le secret est levé : la date et le délai ne changent plus."
        : "Le temps que les derniers cadeaux arrivent. 3 jours par défaut."}
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
