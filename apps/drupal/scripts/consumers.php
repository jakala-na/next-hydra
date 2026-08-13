<?php

/**
 * @file
 * Create the Next Hydra API account and OAuth consumers.
 */

use Drupal\Component\Utility\Crypt;
use Drupal\Component\Utility\Random;
use Drupal\Core\File\FileSystemInterface;
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

$directory = '../keys';
$file_system = \Drupal::service('file_system');
$directory_ready = $file_system->prepareDirectory(
  $directory,
  FileSystemInterface::CREATE_DIRECTORY | FileSystemInterface::MODIFY_PERMISSIONS,
);

if (!$directory_ready) {
  throw new RuntimeException("Could not create the OAuth key directory: {$directory}");
}

if (!is_file("{$directory}/public.key") || !is_file("{$directory}/private.key")) {
  \Drupal::service('simple_oauth.key.generator')->generateKeys($directory);
}

$messages = [
  'Consumers created successfully. Save these credentials in the connector environment.',
  'DRUPAL_PREVIEWER_CLIENT_ID=' . $credentials['previewer']['client_id'],
  'DRUPAL_PREVIEWER_CLIENT_SECRET=' . $credentials['previewer']['client_secret'],
  'DRUPAL_VIEWER_CLIENT_ID=' . $credentials['viewer']['client_id'],
  'DRUPAL_VIEWER_CLIENT_SECRET=' . $credentials['viewer']['client_secret'],
];

foreach ($messages as $message) {
  echo $message . PHP_EOL;
}
