// Grandes régions (filtre « Afrique », « Europe »…) : code pays ISO -> région. Un pays absent de la liste n'est simplement pas rattaché à une région.
const R: Record<string, string> = {
  afrique: 'DZ AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW RE YT',
  europe: 'AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA AX IM JE GG GI FO GL SJ TRNC GB-ENG GB-SCT GB-WLS GB-NIR',
  asie: 'AF BD BT BN KH CN GE HK ID IN JP KZ KG KR LA LK MO MV MY MM MN NP PH PK SG TH TJ TM TW UZ VN TL',
  'moyen-orient': 'AE BH IL IQ IR JO KW LB OM PS QA SA SY TR YE AM AZ',
  ameriques: 'US CA MX AR BO BR CL CO CR CU DO EC SV GT HN HT JM NI PA PY PE PR UY VE GP MQ GF AI AG BB GD MS KN AN LC VC DM TC VG KY BS BZ TT VI',
  oceanie: 'AU NZ FJ PG SB TO WS WS-S NR KI GU VU NC PF',
};
const MAP = new Map<string, string>(); for (const [r, codes] of Object.entries(R)) for (const c of codes.split(' ')) MAP.set(c, r);
export const regionOf = (code: string) => MAP.get(code.toUpperCase());
