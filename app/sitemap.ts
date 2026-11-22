import { SITE } from '@/lib/site';
export default function sitemap() { return [['', 1], ['/features', .8], ['/cartes', .8], ['/pricing', .9], ['/woocommerce', .8], ['/dons', .8], ['/contact', .6], ['/terms', .4], ['/privacy', .4], ['/refund-policy', .4], ['/login', .3], ['/register', .5]].map(([p, pr]) => ({ url: SITE + p, lastModified: new Date(), priority: pr as number })); }
