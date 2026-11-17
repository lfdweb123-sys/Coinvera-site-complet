import { makeCaptcha } from '@/lib/captcha';
export async function GET() { return Response.json(makeCaptcha()); }
