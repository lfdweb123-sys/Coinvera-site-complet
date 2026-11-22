// Emplacements de licence par site ET par plugin. Une licence unique sert plusieurs plugins sur un même site :
// désactiver l'un d'eux ne doit libérer le site que si plus aucun autre plugin ne l'utilise.
// `slots` = liste de "origine|plugin". Un site présent dans `sites` sans aucun emplacement date d'avant ce mécanisme :
// seul le plugin WooCommerce existait alors, il est donc traité comme « woocommerce ».
export const DEFAULT_PLUGIN = 'woocommerce';
const slot = (site: string, plugin: string) => `${site}|${plugin}`;
const has = (slots: string[], site: string) => slots.some(s => s.startsWith(site + '|'));

export function activateSlots(sites: string[], slots: string[], site: string, plugin: string = DEFAULT_PLUGIN) {
  const s = [...sites], sl = [...slots]; let addedSite = false;
  if (!s.includes(site)) { s.push(site); addedSite = true; }
  else if (!has(sl, site)) sl.push(slot(site, DEFAULT_PLUGIN));   // activation antérieure : c'était le plugin WooCommerce
  if (!sl.includes(slot(site, plugin))) sl.push(slot(site, plugin));
  return { sites: s, slots: sl, addedSite };
}

export function deactivateSlots(sites: string[], slots: string[], site: string, plugin: string = DEFAULT_PLUGIN) {
  // Site ancien (sans emplacement) et plugin autre que WooCommerce : WooCommerce l'utilise encore, on ne touche à rien.
  if (!has(slots, site) && plugin !== DEFAULT_PLUGIN) return { sites: [...sites], slots: [...slots] };
  const sl = slots.filter(x => x !== slot(site, plugin));
  return { sites: has(sl, site) ? [...sites] : sites.filter(x => x !== site), slots: sl };
}
