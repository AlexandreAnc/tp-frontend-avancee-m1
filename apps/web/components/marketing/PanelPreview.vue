<template>
  <!-- Illustration en HTML (pas d'image à télécharger) : nette à toutes les tailles, sans impact sur le chargement. -->
  <figure class="relative mx-auto w-full max-w-md">
    <figcaption class="sr-only">
      Aperçu d’une conversation : l’utilisateur demande combien il doit au plombier ; l’agent Documents trouve la facture et répond 340,50 euros, à payer avant le 30 novembre, puis propose un rappel.
    </figcaption>
    <div aria-hidden="true" class="flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-popover sm:p-5">
      <div class="flex items-center gap-3 border-b pb-3">
        <BrandLogo :size="36" />
        <div>
          <p class="text-sm font-extrabold">Assistant DashIA</p>
          <p class="flex items-center gap-1.5 text-xs font-bold text-primary-strong"><span class="size-1.5 rounded-full bg-current" />Agent en ligne · modèle local</p>
        </div>
      </div>
      <p class="ml-auto max-w-[85%] rounded-lg rounded-br-xs bg-ink px-3.5 py-2.5 text-sm text-on-ink">Combien je dois au plombier ?</p>
      <div class="flex flex-col gap-1.5 rounded-md bg-surface-muted p-3 text-xs text-muted">
        <p class="flex items-center gap-2"><AppIcon name="sitemap" :size="12" />Délégation à l’agent <strong class="text-text">Documents</strong></p>
        <p class="flex items-center gap-2"><AppIcon name="search" :size="12" />Recherche « plombier » · 1 document trouvé</p>
      </div>
      <div class="max-w-[90%] rounded-lg rounded-bl-xs border bg-surface px-3.5 py-2.5 text-sm">
        <p>Vous devez <strong>340,50 €</strong> à Plomberie Martin, à régler avant le <strong>30 novembre</strong>.</p>
        <p class="mt-2 flex items-center gap-1.5 text-xs font-bold text-muted"><AppIcon name="file-pdf" :size="12" />facture-plombier.pdf</p>
      </div>
      <div class="flex items-center gap-3 rounded-md border border-primary/30 bg-primary-soft p-3 text-sm">
        <AppIcon name="bell" :size="14" class="text-primary-strong" />
        <span class="flex-1">Rappel la veille à 9 h ?</span>
        <span class="rounded-sm bg-ink px-2.5 py-1 text-xs font-bold text-on-ink">Valider</span>
      </div>
    </div>
  </figure>
</template>
