<?php
if (!defined('ABSPATH')) exit;

/** Cagnottes : type de contenu "cvd_campaign" (objectif, date limite, montant minimum, montants suggérés). */
final class CVD_Campaigns {
  const CPT = 'cvd_campaign';

  public static function init() {
    add_action('init', [__CLASS__, 'register']);
    add_action('add_meta_boxes', [__CLASS__, 'boxes']);
    add_action('save_post_' . self::CPT, [__CLASS__, 'save'], 10, 2);
    add_filter('manage_' . self::CPT . '_posts_columns', function ($c) { return ['cb' => $c['cb'], 'title' => 'Cagnotte', 'cvd_goal' => 'Objectif', 'cvd_raised' => 'Collecté', 'cvd_code' => 'Shortcode', 'date' => $c['date']]; });
    add_action('manage_' . self::CPT . '_posts_custom_column', [__CLASS__, 'column'], 10, 2);
  }

  public static function register() {
    register_post_type(self::CPT, [
      'labels' => ['name' => 'Cagnottes', 'singular_name' => 'Cagnotte', 'add_new' => 'Nouvelle cagnotte', 'add_new_item' => 'Ajouter une cagnotte', 'edit_item' => 'Modifier la cagnotte', 'all_items' => 'Cagnottes', 'not_found' => 'Aucune cagnotte'],
      'public' => false, 'show_ui' => true, 'show_in_menu' => 'cvd-donations', 'show_in_rest' => false, 'supports' => ['title', 'editor'], 'capability_type' => 'post', 'map_meta_cap' => true, 'rewrite' => false, 'query_var' => false,
    ]);
  }

  /** Cagnotte publiée sous forme de tableau, ou null. */
  public static function get($id) {
    $p = get_post((int) $id);
    if (!$p || $p->post_type !== self::CPT || $p->post_status !== 'publish') return null;
    $show = get_post_meta($p->ID, '_cvd_show_donors', true);
    return ['id' => $p->ID, 'title' => get_the_title($p), 'content' => $p->post_content,
      'goal' => (int) get_post_meta($p->ID, '_cvd_goal', true), 'deadline' => (string) get_post_meta($p->ID, '_cvd_deadline', true),
      'min' => (int) get_post_meta($p->ID, '_cvd_min', true), 'suggested' => (string) get_post_meta($p->ID, '_cvd_suggested', true),
      'closed' => get_post_meta($p->ID, '_cvd_closed', true) === '1', 'show_donors' => $show === '' ? (bool) CVD_Settings::get('show_donors') : $show === '1'];
  }
  public static function is_open($c) {
    if ($c['closed']) return false;
    return $c['deadline'] === '' || current_time('Y-m-d') <= $c['deadline'];
  }

  public static function boxes() {
    add_meta_box('cvd_settings', 'Réglages de la cagnotte', [__CLASS__, 'box'], self::CPT, 'normal', 'high');
  }
  public static function box($post) {
    wp_nonce_field('cvd_campaign_' . $post->ID, 'cvd_campaign_nonce');
    $g = (int) get_post_meta($post->ID, '_cvd_goal', true); $m = (int) get_post_meta($post->ID, '_cvd_min', true);
    $d = (string) get_post_meta($post->ID, '_cvd_deadline', true); $s = (string) get_post_meta($post->ID, '_cvd_suggested', true);
    $show = get_post_meta($post->ID, '_cvd_show_donors', true); if ($show === '') $show = CVD_Settings::get('show_donors') ? '1' : '0';
    $t = CVD_DB::totals($post->ID);
    echo '<table class="form-table" role="presentation">';
    printf('<tr><th><label for="cvd_goal">Objectif (USD)</label></th><td><input type="text" id="cvd_goal" name="cvd_goal" value="%s" class="regular-text" placeholder="1000"> <p class="description">Laissez vide pour une cagnotte sans objectif.</p></td></tr>', esc_attr($g ? $g / 100 : ''));
    printf('<tr><th><label for="cvd_deadline">Date limite</label></th><td><input type="date" id="cvd_deadline" name="cvd_deadline" value="%s"></td></tr>', esc_attr($d));
    printf('<tr><th><label for="cvd_min">Don minimum (USD)</label></th><td><input type="text" id="cvd_min" name="cvd_min" value="%s" class="small-text" placeholder="%s"></td></tr>', esc_attr($m ? $m / 100 : ''), esc_attr((string) CVD_Settings::get('min_amount')));
    printf('<tr><th><label for="cvd_suggested">Montants suggérés (USD)</label></th><td><input type="text" id="cvd_suggested" name="cvd_suggested" value="%s" class="regular-text" placeholder="%s"> <p class="description">Séparés par des virgules (8 maximum).</p></td></tr>', esc_attr($s), esc_attr((string) CVD_Settings::get('suggested')));
    printf('<tr><th>Options</th><td><label><input type="checkbox" name="cvd_show_donors" value="1"%s> Afficher les derniers donateurs</label><br><label><input type="checkbox" name="cvd_closed" value="1"%s> Cagnotte clôturée (n’accepte plus de dons)</label></td></tr>', checked($show, '1', false), checked(get_post_meta($post->ID, '_cvd_closed', true), '1', false));
    echo '</table>';
    if ($post->post_status === 'publish') printf('<p><strong>Collecté :</strong> %s (%d don%s confirmé%s)<br><strong>Shortcode :</strong> <code>[coinvera_campaign id="%d"]</code></p>', esc_html(CVD_Util::money($t['raised'])), $t['count'], $t['count'] > 1 ? 's' : '', $t['count'] > 1 ? 's' : '', $post->ID);
    else echo '<p class="description">Publiez la cagnotte pour obtenir son shortcode.</p>';
  }

  public static function save($id, $post) {
    if (!isset($_POST['cvd_campaign_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['cvd_campaign_nonce'])), 'cvd_campaign_' . $id)) return;
    if ((defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) || wp_is_post_revision($id) || !current_user_can('edit_post', $id)) return;
    $in = function ($k) { return isset($_POST[$k]) ? trim(sanitize_text_field(wp_unslash($_POST[$k]))) : ''; };
    $goal = $in('cvd_goal') === '' ? null : CVD_Util::to_cents($in('cvd_goal')); $min = $in('cvd_min') === '' ? null : CVD_Util::to_cents($in('cvd_min'), 100);
    $d = $in('cvd_deadline'); if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !strtotime($d)) $d = '';
    $sug = implode(',', array_map(function ($c) { return $c / 100; }, CVD_Util::parse_amounts($in('cvd_suggested'))));
    update_post_meta($id, '_cvd_goal', $goal ?: 0); update_post_meta($id, '_cvd_min', $min ?: 0); update_post_meta($id, '_cvd_deadline', $d); update_post_meta($id, '_cvd_suggested', $sug);
    update_post_meta($id, '_cvd_show_donors', isset($_POST['cvd_show_donors']) ? '1' : '0'); update_post_meta($id, '_cvd_closed', isset($_POST['cvd_closed']) ? '1' : '0');
  }

  public static function column($col, $id) {
    if ($col === 'cvd_goal') { $g = (int) get_post_meta($id, '_cvd_goal', true); echo $g ? esc_html(CVD_Util::money($g)) : '—'; }
    elseif ($col === 'cvd_raised') { $t = CVD_DB::totals($id); echo esc_html(CVD_Util::money($t['raised'])); }
    elseif ($col === 'cvd_code') echo '<code>[coinvera_campaign id="' . (int) $id . '"]</code>';
  }
}
