<?php

/**
 * @file
 * Next Hydra settings shared by all Drupal sites and environments.
 */

declare(strict_types=1);

// Acquia provides a persistent private-files path through its recommended
// settings. Store OAuth signing keys there instead of in the code artifact.
if (!empty($settings['file_private_path'])) {
  $simple_oauth_key_directory = $settings['file_private_path'] . '/simple_oauth';
  $config['simple_oauth.settings']['public_key'] = $simple_oauth_key_directory . '/public.key';
  $config['simple_oauth.settings']['private_key'] = $simple_oauth_key_directory . '/private.key';
}

// Optional integrations are installed by their selected composition recipes.
foreach (glob(__DIR__ . "/integrations/*.settings.php") ?: [] as $integration_settings) {
  require $integration_settings;
}
