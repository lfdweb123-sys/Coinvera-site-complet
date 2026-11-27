import Shell from '@/components/Shell';
export const metadata = { robots: { index: false, follow: false } };
const g = (title: string, items: [string, string, string][]) => ({ title, items: items.map(([h, label, icon]) => ({ href: '/dashboard' + h, label, icon })) });
const groups = [g('Vue d’ensemble', [['', 'Overview', 'dash'], ['/transactions', 'Transactions', 'tx'], ['/payments', 'Payment Links', 'link']]),
  g('Trésorerie', [['/withdrawals', 'Crypto Wallet', 'wd'], ['/cards', 'Virtuals cards standard', 'pay'], ['/carte-pro', 'Virtuals cards pro', 'pay'], ['/mes-cartes', 'Mes cartes', 'pay'], ['/numeros', 'WhatsApp & Telegram numbers', 'phone'], ['/proxnum', 'ProxNum', 'phone'], ['/esim', 'eSIM', 'esim'], ['/balances', 'Balances', 'bal'], ['/reports', 'Reports', 'rep']]),
  g('Encaisser', [['/activate', 'Activate', 'badge'], ['/api', 'API & Developers', 'key'], ['/woocommerce', 'Plugins', 'shop'], ['/webhooks', 'Webhooks', 'hook']]),
  g('Compte', [['/settings', 'Settings & Profile', 'set'], ['/support', 'Contact Support', 'help']])];
export default function L({ children }: { children: React.ReactNode }) { return <Shell groups={groups} quick={['/dashboard', '/dashboard/transactions', '/dashboard/withdrawals', '/dashboard/api']}>{children}</Shell>; }
