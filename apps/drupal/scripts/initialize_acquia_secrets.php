<?php

/**
 * @file
 * Initialize secrets required before Drupal can be installed on Acquia.
 */

declare(strict_types=1);

$secrets_file = $argv[1] ?? NULL;
if (!is_string($secrets_file) || $secrets_file === '') {
  $site_group = getenv('AH_SITE_GROUP');
  $site_environment = getenv('AH_SITE_ENVIRONMENT');

  if (!is_string($site_group) || $site_group === '' || !is_string($site_environment) || $site_environment === '') {
    throw new RuntimeException('Acquia environment variables are not available.');
  }

  $secrets_file = "/mnt/files/{$site_group}.{$site_environment}/secrets.settings.php";
}

$directory = dirname($secrets_file);
$previous_umask = umask(0077);
try {
  if (!is_dir($directory) && !mkdir($directory, 0700, TRUE) && !is_dir($directory)) {
    throw new RuntimeException("Could not create the Acquia secrets directory: {$directory}");
  }

  $handle = fopen($secrets_file, 'c+');
  if ($handle === FALSE) {
    throw new RuntimeException("Could not open the Acquia secrets file: {$secrets_file}");
  }

  try {
    if (!flock($handle, LOCK_EX)) {
      throw new RuntimeException("Could not lock the Acquia secrets file: {$secrets_file}");
    }

    $contents = stream_get_contents($handle);
    if ($contents === FALSE) {
      throw new RuntimeException("Could not read the Acquia secrets file: {$secrets_file}");
    }

    $marker = 'Next Hydra managed hash salt';
    if (!str_contains($contents, $marker)) {
      if ($contents === '') {
        $contents = "<?php\n";
      }
      elseif (!str_contains($contents, '<?php')) {
        throw new RuntimeException("The Acquia secrets file is not a PHP file: {$secrets_file}");
      }

      $hash_salt = rtrim(strtr(base64_encode(random_bytes(55)), '+/', '-_'), '=');
      $assignment = "\n\$settings['hash_salt'] = '{$hash_salt}'; // {$marker}\n";
      if (preg_match('/\\?>\\s*$/', $contents) === 1) {
        $contents = preg_replace('/\\?>\\s*$/', $assignment . "?>\n", $contents);
      }
      else {
        $contents .= $assignment;
      }

      if (!is_string($contents) || !rewind($handle) || !ftruncate($handle, 0) || fwrite($handle, $contents) === FALSE || !fflush($handle)) {
        throw new RuntimeException("Could not write the Acquia secrets file: {$secrets_file}");
      }
    }

    flock($handle, LOCK_UN);
  }
  finally {
    fclose($handle);
  }

  if (!chmod($secrets_file, 0600)) {
    throw new RuntimeException("Could not secure the Acquia secrets file: {$secrets_file}");
  }
}
finally {
  umask($previous_umask);
}

echo "Persistent Acquia settings are ready at {$secrets_file}." . PHP_EOL;
