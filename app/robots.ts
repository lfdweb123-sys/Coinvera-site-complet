import { SITE } from '@/lib/site';
// Aucun chemin privé n'est listé ici (robots.txt est public) : les pages privées sont exclues par l'en-tête X-Robots-Tag (voir next.config).
export default function robots() { return { rules: [{ userAgent: '*', allow: '/' }], sitemap: SITE + '/sitemap.xml', host: SITE }; }
