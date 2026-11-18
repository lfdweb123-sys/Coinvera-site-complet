import { LogoMark } from '@/components/Illustrations';
export const Spinner = ({ s = 22 }: { s?: number }) => <span className="spin" style={{ width: s, height: s }} role="status" aria-label="Chargement" />;
export const PageLoader = ({ full }: { full?: boolean }) => <div className={'pl' + (full ? ' full' : '')}><div className="pl-in"><LogoMark s={44} /><Spinner s={26} /></div></div>;
