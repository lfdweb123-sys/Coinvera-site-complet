import type { Metadata } from 'next';
// Métadonnées SEO d'une page publique : titre, description, mots-clés, URL canonique, Open Graph et Twitter propres à la page
// (sans cela, Next.js hérite de l'Open Graph de la page d'accueil, avec son titre et son URL).
export function seo({ title, description, path, keywords = [], absolute, noindex }: { title: string; description: string; path: string; keywords?: string[]; absolute?: boolean; noindex?: boolean }): Metadata {
  const full = absolute ? title : `${title} | Coinvera`;
  return {
    title: absolute ? { absolute: title } : title, description, keywords: [...keywords, 'Coinvera'], alternates: { canonical: path },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: 'website', locale: 'fr_FR', siteName: 'Coinvera', url: path, title: full, description },
    twitter: { card: 'summary_large_image', title: full, description },
  };
}
