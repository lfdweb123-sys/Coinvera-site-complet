import Shell from '@/components/Shell';
export const metadata = { robots: { index: false } };
const nav = [['', 'Overview', 'dash'], ['/transactions', 'Transactions', 'tx'], ['/payments', 'Payments', 'pay'], ['/withdrawals', 'Withdrawals', 'wd'], ['/balances', 'Balances', 'bal'], ['/api', 'API & Developers', 'key'], ['/woocommerce', 'WooCommerce', 'shop'], ['/webhooks', 'Webhooks', 'hook'], ['/reports', 'Reports', 'rep'], ['/support', 'Contact Support', 'help'], ['/settings', 'Settings', 'set']].map(([h, l, i]) => ({ href: '/dashboard' + h, label: l, icon: i }));
export default function L({ children }: { children: React.ReactNode }) { return <Shell nav={nav}>{children}</Shell>; }
