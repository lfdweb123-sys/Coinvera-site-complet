<?php
if (!defined('ABSPATH')) exit;

/** Cycle de vie (cron horaire, idempotent : le rejouer ne produit aucun effet en double). */
final class CVS_Cycle {
  public static function init() { add_action('cvs_cycle', [__CLASS__, 'run']); }

  public static function run($now = null) {
    $now = $now ?? CVS_Util::now(); $live = CVS_Settings::configured() && CVS_API::licensed();
    CVS_DB::purge_abandoned();
    if ($live) { self::renewals($now); self::reminders($now); }
    CVS_DB::to_past_due($now);
    foreach (CVS_DB::past_due_subs($now) as $s) {
      $plan = CVS_Plans::get($s->plan_id); $grace = $plan ? $plan['grace'] : 0;
      if (CVS_Util::add_days($s->period_end, $grace) >= $now) continue;
      if (!CVS_DB::expire($s->id)) continue;   // une seule exécution envoie l'e-mail
      $charge = ($live && $plan) ? CVS_DB::ensure_renewal($s, $plan['price'], $now) : CVS_DB::pending_renewal($s->id);
      CVS_Mail::send('expired', $s, $plan, $charge);
    }
  }

  private static function renewals($now) {
    foreach (CVS_DB::renewal_candidates($now) as $s) {
      $plan = CVS_Plans::get($s->plan_id); if (!$plan) continue;
      if ($now < CVS_Util::add_days($s->period_end, -$plan['remind'])) continue;
      $c = CVS_DB::ensure_renewal($s, $plan['price'], $s->period_end, $created);   // montant figé à la création
      if ($created && $c) CVS_Mail::send('new', $s, $plan, $c);
    }
  }
  /** Rappels : la veille de l'échéance, puis le jour même (au plus un par exécution, sans doublon). */
  private static function reminders($now) {
    foreach (CVS_DB::pending_renewals_for_reminders() as $c) {
      $target = $now >= $c->due_at ? 2 : ($now >= CVS_Util::add_days($c->due_at, -1) ? 1 : 0);
      if ($target <= (int) $c->reminders_sent) continue;
      if (!CVS_DB::claim_reminder($c->id, $c->reminders_sent, $target)) continue;
      $s = CVS_DB::sub($c->sub_id); if ($s) CVS_Mail::send('remind', $s, CVS_Plans::get($s->plan_id), $c);
    }
  }
}
