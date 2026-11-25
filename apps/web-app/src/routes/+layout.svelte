<script lang="ts">
  import "@wishalia/ui/styles.css";

  import { page } from "$app/state";
  import { commonMessages } from "@wishalia/i18n/messages/common";
  import { provideI18n } from "@wishalia/ui/i18n.ts";

  let { data, children } = $props();
  // page.data: a child's load may know better (the account's language, in the app's layout)
  const i18n = provideI18n(() => page.data.locale ?? data.locale);
</script>

<a class="skip-link" href="#contenu">{commonMessages(i18n.locale).skipLink}</a>
{@render children()}
