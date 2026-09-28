<?php

/**
 * @file
 * Local DDEV test control for the live article-template browser scenarios.
 *
 * The driver supplies $operation and $input. Fixtures use the installed recipe
 * and Canvas's real auto-save, publish, and signed-preview services.
 */

use Drupal\canvas\AutoSave\AutoSaveManager;
use Drupal\canvas\Controller\ApiAutoSaveController;
use Drupal\canvas\Entity\Component;
use Drupal\canvas\Entity\ContentTemplate;
use Drupal\canvas_headless\PreviewAssertionFactoryInterface;
use Drupal\node\Entity\Node;
use Drupal\user\Entity\User;
use Symfony\Component\HttpFoundation\Request;

$manager = \Drupal::entityTypeManager();
$auto_save = \Drupal::service(AutoSaveManager::class);
$template = ContentTemplate::load('node.article.full');
if (!$template || !$template->status()) {
  throw new RuntimeException('Install the starter article content template before running these scenarios.');
}
$switcher = \Drupal::service('account_switcher');
$switcher->switchTo(User::load(1));

$article_info = static function (Node $node, string $language = 'en'): array {
  $article = $node->getTranslation($language);
  $prefix = \Drupal::config('language.negotiation')->get('url.prefixes.' . $language);
  $alias = \Drupal::service('path_alias.manager')->getAliasByPath('/node/' . $node->id(), $language);
  preg_match('/<h2>(.*?)<\/h2>/', $article->get('body')->processed, $heading);
  return [
    'id' => (int) $node->id(),
    'path' => ($prefix ? '/' . $prefix : '') . $alias,
    'title' => $article->label(),
    'summary' => $article->get('field_summary')->value,
    'bodyHeading' => html_entity_decode(strip_tags($heading[1] ?? '')),
    'fingerprint' => hash('sha256', json_encode($article->toArray(), JSON_THROW_ON_ERROR)),
  ];
};
$preview = static function (Node $node, string $language = 'en'): string {
  return \Drupal::service(PreviewAssertionFactoryInterface::class)->issue(
    User::load(1), '/node/' . $node->id(), 'rel:working-copy', FALSE,
    ['viewMode' => 'full', 'language' => $language],
  );
};

try {
  switch ($operation) {
    case 'inspect':
      $second = $manager->getStorage('node')->loadByProperties([
        'uuid' => '823f1c6c-ed43-4d95-8632-fb983ee89030',
      ]);
      $first = $manager->getStorage('node')->loadByProperties(['uuid' => 'd128b08b-22c0-4603-8d90-4595df7e6853']);
      $first = reset($first);
      $second = reset($second);
      if (!$first || !$second || !$first->hasTranslation('fr')) {
        throw new RuntimeException('The recipe must contain two articles and the French article translation.');
      }
      $result = [$article_info($first), $article_info($second), $article_info($first, 'fr')];
      break;

    case 'stage-template':
      if ($auto_save->getAutoSaveEntity($template)->entity !== NULL) {
        throw new RuntimeException('Finish the existing article-template draft before running this scenario.');
      }
      $tree = $template->getComponentTree()->getValue();
      $tree[] = [
        'uuid' => $input['uuid'],
        'parent_uuid' => '4eaf5c38-6bd6-435c-bad8-36b07639e351',
        'slot' => 'body',
        'component_id' => 'js.text',
        'component_version' => Component::load('js.text')->getActiveVersion(),
        'inputs' => ['text' => $input['notice']],
      ];
      $template->setComponentTree($tree);
      $auto_save->saveEntity($template);
      $result = ['assertion' => $preview(Node::load($input['nodeId']))];
      break;

    case 'publish-template':
      $key = AutoSaveManager::getAutoSaveKey($template);
      $entry = $auto_save->getAllAutoSaveList(FALSE, FALSE)[$key] ?? NULL;
      if (!$entry) {
        throw new RuntimeException('The article-template draft is missing.');
      }
      $controller = \Drupal::service('class_resolver')->getInstanceFromDefinition(ApiAutoSaveController::class);
      $response = $controller->post(Request::create(
        '/canvas/api/v0/auto-saves/publish', 'POST', content: json_encode([$key => $entry], JSON_THROW_ON_ERROR),
      ));
      if ($response->getStatusCode() !== 200) {
        throw new RuntimeException($response->getContent());
      }
      $result = ['published' => TRUE];
      break;

    case 'create-draft':
      $node = Node::create([
        'uuid' => $input['uuid'],
        'type' => 'article',
        'created' => 1767225600,
        'title' => 'Unpublished equipment guide ' . $input['uuid'],
        'status' => FALSE,
        'field_summary' => 'An article that is only available to editors.',
        'body' => ['value' => '<h2>Draft advice</h2><p>This guide is not published.</p>', 'format' => 'basic_html'],
      ]);
      $node->addTranslation('fr', [
        'created' => 1767225600,
        'title' => 'Guide privé ' . $input['uuid'],
        'status' => FALSE,
        'field_summary' => 'Un article réservé aux personnes qui le rédigent.',
        'body' => ['value' => '<h2>Conseils provisoires</h2><p>Ce guide n’est pas encore publié.</p>', 'format' => 'basic_html'],
      ]);
      $node->save();
      $result = ['article' => $article_info($node, 'fr'), 'assertion' => $preview($node, 'fr')];
      break;

    case 'cleanup':
      $draft = $auto_save->getAutoSaveEntity($template)->entity;
      if ($draft instanceof ContentTemplate) {
        foreach ($draft->getComponentTree() as $item) {
          if ($item->uuid === $input['uuid']) {
            $auto_save->delete($template);
            break;
          }
        }
      }
      $tree = $template->getComponentTree()->getValue();
      $remaining = array_filter($tree, static fn(array $item): bool => $item['uuid'] !== $input['uuid']);
      if (count($remaining) !== count($tree)) {
        $template->setComponentTree(array_values($remaining));
        $template->save();
      }
      $draft_nodes = $manager->getStorage('node')->loadByProperties(['uuid' => $input['uuid']]);
      $node = reset($draft_nodes);
      if ($node && $node->label() === 'Unpublished equipment guide ' . $input['uuid']) {
        $node->delete();
      }
      $result = ['cleaned' => TRUE];
      break;

    default:
      throw new InvalidArgumentException('Unknown article-template test operation.');
  }
  echo json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
finally {
  $switcher->switchBack();
}
