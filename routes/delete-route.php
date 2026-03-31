<?php
header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$id = $input['id'] ?? null;

if (!$id) {
  echo json_encode(['ok' => false, 'error' => 'Missing id']);
  exit;
}

$path = __DIR__ . '/routes.json';
if (!file_exists($path)) {
  echo json_encode(['ok' => false, 'error' => 'routes.json not found']);
  exit;
}

$routes = json_decode(file_get_contents($path), true);
if (!is_array($routes)) $routes = [];

$before = count($routes);
$routes = array_values(array_filter($routes, fn($r) => ($r['id'] ?? '') !== $id));
$after = count($routes);

if ($after === $before) {
  echo json_encode(['ok' => false, 'error' => 'Route id not found']);
  exit;
}

file_put_contents($path, json_encode($routes, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true]);
