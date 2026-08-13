<?php

/**
 * @file
 * Configure the shared secret for Drupal-triggered frontend revalidation.
 */

use Drupal\Component\Utility\Crypt;
use Drupal\next\Entity\NextSite;

$site = NextSite::load('next_hydra');
if (!$site) {
  throw new RuntimeException('The Next Hydra frontend site is not configured.');
}

$revalidation_secret = Crypt::randomBytesBase64(32);
$site->setRevalidateSecret($revalidation_secret);
$site->save();

echo 'CMS_REVALIDATION_SECRET=' . $revalidation_secret . PHP_EOL;
