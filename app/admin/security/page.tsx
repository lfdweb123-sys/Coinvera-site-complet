'use client';
import { useData } from '@/lib/client';
import TwoFactorCard from '@/components/TwoFactorCard';
export default function Security() { const me = useData('/api/me'); return <div className="stack"><h1>Sécurité</h1>{me.data && !me.data.twoFactor && <div className="err" role="alert">La double authentification est obligatoire pour accéder à l’administration. Activez-la ci-dessous pour continuer.</div>}<TwoFactorCard /></div>; }
