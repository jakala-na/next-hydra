<?php

/**
 * @file
 * Configure the shared secret for Drupal-triggered frontend revalidation.
 */

use Drupal\Component\Utility\Crypt;
use Drupal\Core\Site\Settings;
use Drupal\next\Entity\NextSite;

$site = NextSite::load('next_hydra');
if (!$site) {
  throw new RuntimeException('The Next Hydra frontend site is not configured.');
}

$revalidation_secret = Crypt::randomBytesBase64(32);
$site->setRevalidateSecret($revalidation_secret);
$site->save();

$credential_line = 'CMS_REVALIDATION_SECRET=' . $revalidation_secret;

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
      $credential_line . PHP_EOL,
      FILE_APPEND | LOCK_EX,
    );
  }
  finally {
    umask($previous_umask);
  }
  if ($written === FALSE || !chmod($credential_file, 0600)) {
    throw new RuntimeException("Could not securely write {$credential_file}.");
  }

  echo "Revalidation configured. The secret was written to {$credential_file}." . PHP_EOL;
}
else {
  echo $credential_line . PHP_EOL;
}
