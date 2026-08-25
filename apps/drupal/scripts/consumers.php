<?php

/**
 * @file
 * Create the Next Hydra API account and OAuth consumers.
 */

use Drupal\Component\Utility\Crypt;
use Drupal\Component\Utility\Random;
use Drupal\Core\File\FileSystemInterface;
use Drupal\Core\Site\Settings;
use Drupal\user\Entity\User;

$random = new Random();
$user_storage = \Drupal::entityTypeManager()->getStorage('user');
$accounts = $user_storage->loadByProperties(['name' => 'next_hydra_api']);
$api_account = reset($accounts);

if (!$api_account) {
  $api_account = User::create([
    'name' => 'next_hydra_api',
    'mail' => 'next-hydra-api@example.invalid',
    'pass' => Crypt::randomBytesBase64(),
    'status' => TRUE,
  ]);
}

foreach (['viewer', 'previewer'] as $role_id) {
  if (!$api_account->hasRole($role_id)) {
    $api_account->addRole($role_id);
  }
}
$api_account->save();

$consumer_storage = \Drupal::entityTypeManager()->getStorage('consumer');
$consumer_definitions = [
  'previewer' => [
    'label' => 'Next Hydra Previewer',
    'scope' => 'content_preview',
  ],
  'viewer' => [
    'label' => 'Next Hydra Viewer',
    'scope' => 'content_published',
  ],
];
$credentials = [];

foreach ($consumer_definitions as $mode => $definition) {
  $client_id = Crypt::randomBytesBase64();
  $client_secret = $random->word(32);
  $consumer_storage->create([
    'client_id' => $client_id,
    'secret' => $client_secret,
    'label' => $definition['label'],
    'user_id' => $api_account->id(),
    'third_party' => TRUE,
    'is_default' => FALSE,
    'grant_types' => ['client_credentials'],
    'scopes' => [
      ['scope_id' => $definition['scope']],
    ],
  ])->save();
  $credentials[$mode] = [
    'client_id' => $client_id,
    'client_secret' => $client_secret,
  ];
}

$simple_oauth_settings = \Drupal::config('simple_oauth.settings');
$private_key_path = $simple_oauth_settings->get('private_key');
$public_key_path = $simple_oauth_settings->get('public_key');

if (!is_string($private_key_path) || !is_string($public_key_path)) {
  throw new RuntimeException('Simple OAuth key paths are not configured.');
}

$private_key_directory = dirname($private_key_path);
$public_key_directory = dirname($public_key_path);
if ($private_key_directory !== $public_key_directory) {
  throw new RuntimeException('Simple OAuth public and private keys must share a directory.');
}

$directory = $private_key_directory;
$file_system = \Drupal::service('file_system');
$directory_ready = $file_system->prepareDirectory(
  $directory,
  FileSystemInterface::CREATE_DIRECTORY | FileSystemInterface::MODIFY_PERMISSIONS,
);

if (!$directory_ready) {
  throw new RuntimeException("Could not create the OAuth key directory: {$directory}");
}

if (!is_file($public_key_path) || !is_file($private_key_path)) {
  \Drupal::service('simple_oauth.key.generator')->generateKeys($directory);
}

$credential_lines = [
  'DRUPAL_PREVIEWER_CLIENT_ID=' . $credentials['previewer']['client_id'],
  'DRUPAL_PREVIEWER_CLIENT_SECRET=' . $credentials['previewer']['client_secret'],
  'DRUPAL_VIEWER_CLIENT_ID=' . $credentials['viewer']['client_id'],
  'DRUPAL_VIEWER_CLIENT_SECRET=' . $credentials['viewer']['client_secret'],
];

if (getenv('AH_SITE_ENVIRONMENT')) {
  $private_files_path = Settings::get('file_private_path');
  if (!is_string($private_files_path) || $private_files_path === '') {
    throw new RuntimeException('The Acquia private files path is not configured.');
  }

  $credential_file = $private_files_path . '/next-hydra-bootstrap.env';
  $previous_umask = umask(0077);
  try {
    $written = file_put_contents(
      $credential_file,
      implode(PHP_EOL, $credential_lines) . PHP_EOL,
      LOCK_EX,
    );
  }
  finally {
    umask($previous_umask);
  }
  if ($written === FALSE || !chmod($credential_file, 0600)) {
    throw new RuntimeException("Could not securely write {$credential_file}.");
  }

  echo "Consumers created. Credentials were written to {$credential_file}." . PHP_EOL;
}
else {
  echo 'Consumers created successfully. Save these credentials in the connector environment.' . PHP_EOL;
  foreach ($credential_lines as $credential_line) {
    echo $credential_line . PHP_EOL;
  }
}
