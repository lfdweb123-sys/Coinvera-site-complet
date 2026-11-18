import Shell from '@/components/Shell';
export const metadata = { robots: { index: false, follow: false } };
const g = (title: string, items: [string, string, string][]) => ({ title, items: items.map(([h, label, icon]) => ({ href: '/dashboard' + h, label, icon })) });
const groups = [g('Vue d’ensemble', [['', 'Overview', 'dash'], ['/transactions', 'Transactions', 'tx']]), g('Encaisser', [['/payments', 'Payment Links', 'link'], ['/activate', 'Activate', 'badge'], ['/api', 'API & Developers', 'key'], ['/woocommerce', 'WooCommerce', 'shop'], ['/webhooks', 'Webhooks', 'hook']]),
  g('Trésorerie', [['/withdrawals', 'Crypto Wallet', 'wd'], ['/balances', 'Balances', 'bal'], ['/reports', 'Reports', 'rep']]), g('Compte', [['/settings', 'Settings & Profile', 'set'], ['/support', 'Contact Support', 'help']])];
export default function L({ children }: { children: React.ReactNode }) { return <Shell groups={groups} quick={['/dashboard', '/dashboard/transactions', '/dashboard/withdrawals', '/dashboard/api']}>{children}</Shell>; }
