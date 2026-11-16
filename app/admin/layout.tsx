import Shell from '@/components/Shell';
export const metadata = { robots: { index: false } };
const nav = [['', 'Overview', 'dash'], ['/merchants', 'Merchants', 'users'], ['/transactions', 'Transactions', 'tx'], ['/withdrawals', 'Withdrawals', 'wd'], ['/balances', 'Balances', 'bal'], ['/api', 'API Management', 'key'], ['/activations', 'API Activations', 'badge'], ['/licenses', 'WooCommerce Licenses', 'shop'], ['/pricing', 'Fees & Pricing', 'tag'], ['/support', 'Support Tickets', 'help'], ['/notifications', 'Notifications', 'bell'], ['/audit-logs', 'Audit Logs', 'log'], ['/settings', 'Settings', 'set']].map(([h, l, i]) => ({ href: '/admin' + h, label: l, icon: i }));
export default function L({ children }: { children: React.ReactNode }) { return <Shell nav={nav} admin>{children}</Shell>; }
