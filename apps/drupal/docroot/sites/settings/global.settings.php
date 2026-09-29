<?php

declare(strict_types=1);

/**
 * @file
 * Next Hydra settings shared by all Drupal sites and environments.
 */

// Acquia provides a persistent private-files path through its recommended
// settings. Store OAuth signing keys there instead of in the code artifact.
if (!empty($settings['file_private_path'])) {
  $simple_oauth_key_directory = $settings['file_private_path'] . '/simple_oauth';
  $config['simple_oauth.settings']['public_key'] = $simple_oauth_key_directory . '/public.key';
  $config['simple_oauth.settings']['private_key'] = $simple_oauth_key_directory . '/private.key';
}

$frontend_url = getenv('DRUPAL_FRONTEND_URL');
if ($frontend_url !== FALSE && $frontend_url !== '') {
  if (!preg_match('@^https?://(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]+)?/?$@i', $frontend_url) || !filter_var($frontend_url, FILTER_VALIDATE_URL)) {
    throw new InvalidArgumentException('DRUPAL_FRONTEND_URL must be an HTTP(S) origin without a path, query, or credentials.');
  }
  $frontend_url = rtrim($frontend_url, '/');
  $config['canvas_headless.settings']['frontends'][0]['url'] = $frontend_url;
  $config['next.next_site.next_hydra']['base_url'] = $frontend_url;
  $config['next.next_site.next_hydra']['preview_url'] = $frontend_url . '/api/drupal-preview';
  $config['next.next_site.next_hydra']['revalidate_url'] = $frontend_url . '/api/revalidate';

  $form_preview_url = $frontend_url . '/api/drupal-preview?uuid=[node:preview:uuid]&token=[node:preview:token]&langcode=[node:langcode]';
  foreach (['article', 'landing_page'] as $bundle) {
    $config["core.entity_view_display.node.{$bundle}.default"]['content']['preview_token']['settings']['iframe_url'] = $form_preview_url;
  }
}

$revalidate_url = getenv('DRUPAL_REVALIDATE_URL');
if ($revalidate_url !== FALSE && $revalidate_url !== '') {
  $parts = parse_url($revalidate_url);
  if (!filter_var($revalidate_url, FILTER_VALIDATE_URL) || !is_array($parts) || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], TRUE) || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) {
    throw new InvalidArgumentException('DRUPAL_REVALIDATE_URL must be an HTTP(S) URL without credentials or a fragment.');
  }
  $config['next.next_site.next_hydra']['revalidate_url'] = $revalidate_url;
}
