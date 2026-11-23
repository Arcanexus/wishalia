<script lang="ts">
  import "@fontsource-variable/inter";
  import "@fontsource-variable/nunito";
  import "../app.css";

  let { children } = $props();
</script>

<a class="skip-link" href="#contenu">Aller au contenu</a>
{@render children()}
