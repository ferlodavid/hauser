<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { notifications } from '../state/notifications.svelte.ts';
  import { followNotification } from '../state/notification-targets.ts';
  import { relativeDuration } from '../state/notifications.ts';
  import { m } from '../../paraglide/messages.js';
  let { onclose }: { onclose: () => void } = $props();
  let dialog: HTMLDialogElement;
  onMount(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => { previous?.focus(); };
  });
</script>

<dialog bind:this={dialog} class="notification-inbox" aria-labelledby="inbox-title"
        {onclose}>
  <header><h2 id="inbox-title">{m.settings_section_notifications_label()}</h2><button class="secondary-btn pressable" type="button" onclick={() => dialog.close()}>{m.common_close()}</button></header>
  {#if !notifications.items.length}<p>{m.status_all_quiet()}</p>{/if}
  {#each notifications.items as item (item.id)}
    <article>
      <strong>{item.title}</strong>
      {#if item.message}<p class="notification-inbox-message">{item.message}</p>{/if}
      <small>{relativeDuration(item.createdAt, Date.now())}</small>
      <div class="notification-inbox-actions">
        {#if item.action}<button class="secondary-btn pressable" type="button" onclick={() => { followNotification(item); dialog.close(); }}>{m.dev_open()}</button>{/if}
        <button class="secondary-btn pressable" type="button" onclick={() => notifications.dismiss(item.dedupeKey)}>{m.notif_dismiss({ title: item.title })}</button>
      </div>
    </article>
  {/each}
</dialog>
