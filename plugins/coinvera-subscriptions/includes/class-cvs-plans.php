<?php
if (!defined('ABSPATH')) exit;

/** Plans d'abonnement : type de contenu privé « cvs_plan » + méta-boîte. */
final class CVS_Plans {
  const CPT = 'cvs_plan';
  private static $cache = [];

  public static function init() {
    add_action('init', [__CLASS__, 'register']);
    add_action('add_meta_boxes', [__CLASS__, 'boxes']);
    add_action('save_post_' . self::CPT, [__CLASS__, 'save'], 10, 2);
    add_action('save_post', [__CLASS__, 'save_restriction'], 10, 2);
  }
  public static function register() {
    register_post_type(self::CPT, ['labels' => ['name' => 'Plans', 'singular_name' => 'Plan', 'add_new_item' => 'Nouveau plan', 'edit_item' => 'Modifier le plan', 'menu_name' => 'Plans'],
      'public' => false, 'show_ui' => true, 'show_in_menu' => 'cvs-subscribers', 'show_in_rest' => false, 'supports' => ['title', 'editor'], 'capability_type' => 'post', 'map_meta_cap' => true, 'rewrite' => false, 'query_var' => false]);
  }

  /** Plan lisible et borné, ou null s'il n'existe pas / n'est pas valide. */
  public static function get($id) {
    $id = (int) $id; if ($id < 1) return null;
    if (array_key_exists($id, self::$cache)) return self::$cache[$id];
    $p = get_post($id); $out = null;
    if ($p && $p->post_type === self::CPT && $p->post_status === 'publish') {
      $unit = (string) get_post_meta($id, '_cvs_unit', true);
      $out = ['id' => $id, 'title' => CVS_Util::one_line($p->post_title, 120), 'desc' => wp_strip_all_tags((string) $p->post_content),
        'price' => max(100, min(CVS_Util::MAX_CENTS, (int) get_post_meta($id, '_cvs_price_cents', true))), 'unit' => isset(CVS_Util::UNITS[$unit]) ? $unit : 'month',
        'grace' => max(0, min(30, (int) get_post_meta($id, '_cvs_grace_days', true))), 'remind' => max(1, min(30, (int) (get_post_meta($id, '_cvs_remind_days', true) ?: 5))), 'closed' => (bool) get_post_meta($id, '_cvs_closed', true)];
    }
    return self::$cache[$id] = $out;
  }
  public static function all_published() { return get_posts(['post_type' => self::CPT, 'post_status' => 'publish', 'numberposts' => 200, 'orderby' => 'title', 'order' => 'ASC']); }

  public static function boxes() {
    add_meta_box('cvs_plan', 'Tarif et durée', [__CLASS__, 'box_plan'], self::CPT, 'normal', 'high');
    foreach (apply_filters('cvs_restrictable_types', ['post', 'page']) as $t) add_meta_box('cvs_restrict', 'Accès réservé aux abonnés', [__CLASS__, 'box_restrict'], $t, 'side');
  }
  public static function box_plan($post) {
    wp_nonce_field('cvs_plan_' . $post->ID, 'cvs_plan_nonce');
    $c = (int) get_post_meta($post->ID, '_cvs_price_cents', true); $unit = (string) get_post_meta($post->ID, '_cvs_unit', true) ?: 'month';
    $g = get_post_meta($post->ID, '_cvs_grace_days', true); $r = get_post_meta($post->ID, '_cvs_remind_days', true);
    echo '<p><label>Prix par période (USD, 1 à 50 000) <input type="text" name="cvs_price" value="' . esc_attr($c ? rtrim(rtrim(number_format($c / 100, 2, '.', ''), '0'), '.') : '') . '" class="small-text"></label></p><p><label>Période <select name="cvs_unit">';
    foreach (CVS_Util::UNITS as $k => $l) printf('<option value="%s"%s>%s</option>', esc_attr($k), selected($unit, $k, false), esc_html(ucfirst($l)));
    printf('</select></label></p><p><label>Délai de grâce après l’échéance (jours, 0–30) <input type="number" min="0" max="30" name="cvs_grace" value="%d" class="small-text"></label></p>', $g === '' ? 3 : (int) $g);
    printf('<p><label>Envoi du lien de renouvellement (jours avant l’échéance, 1–30) <input type="number" min="1" max="30" name="cvs_remind" value="%d" class="small-text"></label></p>', $r === '' ? 5 : (int) $r);
    printf('<p><label><input type="checkbox" name="cvs_closed" value="1"%s> Fermé : n’accepte plus de nouvelles inscriptions (les abonnés actuels continuent)</label></p>', checked((bool) get_post_meta($post->ID, '_cvs_closed', true), true, false));
    echo '<p class="description">Le prix est figé au moment où chaque échéance est créée : modifier le prix n’affecte pas les échéances déjà envoyées.</p>';
  }
  public static function save($id, $post) {
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (!isset($_POST['cvs_plan_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash((string) $_POST['cvs_plan_nonce'])), 'cvs_plan_' . $id) || !current_user_can('edit_post', $id)) return;
    $c = CVS_Util::to_cents(isset($_POST['cvs_price']) && is_scalar($_POST['cvs_price']) ? wp_unslash((string) $_POST['cvs_price']) : '', 100);
    update_post_meta($id, '_cvs_price_cents', $c === null ? 0 : $c);
    $u = isset($_POST['cvs_unit']) && is_scalar($_POST['cvs_unit']) ? sanitize_key((string) $_POST['cvs_unit']) : 'month';
    update_post_meta($id, '_cvs_unit', isset(CVS_Util::UNITS[$u]) ? $u : 'month');
    update_post_meta($id, '_cvs_grace_days', max(0, min(30, isset($_POST['cvs_grace']) ? absint($_POST['cvs_grace']) : 3)));
    update_post_meta($id, '_cvs_remind_days', max(1, min(30, isset($_POST['cvs_remind']) ? absint($_POST['cvs_remind']) : 5)));
    update_post_meta($id, '_cvs_closed', empty($_POST['cvs_closed']) ? 0 : 1);
    unset(self::$cache[(int) $id]);
  }
  /** Un plan sans prix valide ne peut pas être publié. */
  public static function box_restrict($post) {
    wp_nonce_field('cvs_restrict_' . $post->ID, 'cvs_restrict_nonce');
    $on = (bool) get_post_meta($post->ID, '_cvs_restricted', true); $sel = array_map('intval', (array) get_post_meta($post->ID, '_cvs_plans', true));
    printf('<p><label><input type="checkbox" name="cvs_restricted" value="1"%s> Réserver ce contenu aux abonnés</label></p>', checked($on, true, false));
    echo '<p class="description">Plans autorisés (aucun coché = n’importe quel abonnement valide) :</p>';
    foreach (self::all_published() as $pl) printf('<p><label><input type="checkbox" name="cvs_plans[]" value="%d"%s> %s</label></p>', $pl->ID, checked(in_array($pl->ID, $sel, true), true, false), esc_html($pl->post_title));
  }
  public static function save_restriction($id, $post) {
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (!isset($_POST['cvs_restrict_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash((string) $_POST['cvs_restrict_nonce'])), 'cvs_restrict_' . $id) || !current_user_can('edit_post', $id)) return;
    update_post_meta($id, '_cvs_restricted', empty($_POST['cvs_restricted']) ? 0 : 1);
    $ids = isset($_POST['cvs_plans']) && is_array($_POST['cvs_plans']) ? array_values(array_unique(array_filter(array_map('absint', wp_unslash($_POST['cvs_plans']))))) : [];
    update_post_meta($id, '_cvs_plans', $ids);
  }
}
