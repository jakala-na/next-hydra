<?php

/**
 * @file
 * Credentials for the optional Algolia Content search integration.
 */

declare(strict_types=1);

if (getenv('IS_DDEV_PROJECT') === 'true') {
  // Protect the remote index. Set FALSE only for controlled, safe testing with remote search.
  $config['search_api.index.content']['read_only'] = TRUE;
}

$algolia_application_id = getenv('ALGOLIA_APPLICATION_ID');
$algolia_content_write_api_key = getenv('ALGOLIA_CONTENT_WRITE_API_KEY');
$algolia_content_index_name = getenv('ALGOLIA_CONTENT_INDEX_NAME');

if (
  is_string($algolia_application_id) && $algolia_application_id !== '' &&
  is_string($algolia_content_write_api_key) && $algolia_content_write_api_key !== '' &&
  is_string($algolia_content_index_name) && $algolia_content_index_name !== ''
) {
  $config['search_api.server.algolia_content']['backend_config']['application_id'] = $algolia_application_id;
  $config['search_api.server.algolia_content']['backend_config']['api_key'] = $algolia_content_write_api_key;
  $config['search_api.index.content']['options']['algolia_index_name'] = $algolia_content_index_name;
}
