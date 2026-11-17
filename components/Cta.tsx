'use client';
import Link from 'next/link';
import { useAuthUser } from '@/lib/client';
// Lien qui s'adapte a l'etat de connexion : [guest] pour un visiteur, [user] pour un utilisateur connecte.
export default function CtaLink({ guest, user, className = 'btn p', children }: { guest: [string, string]; user: [string, string]; className?: string; children?: React.ReactNode }) {
  const { user: u } = useAuthUser(); const [href, label] = u ? user : guest;
  return <Link href={href} className={className}>{label}{children}</Link>;
}
