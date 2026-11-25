import { SITE } from '@/lib/site';
export default function robots() { return { rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/admin', '/api', '/verification'] }], sitemap: SITE + '/sitemap.xml', host: SITE }; }
