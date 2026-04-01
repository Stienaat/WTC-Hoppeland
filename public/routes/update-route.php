<?php
header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);
if (!$data || empty($data['id'])) {
  echo json_encode(['ok' => false, 'error' => 'Ongeldige input']);
  exit;
}

$file = 'routes.json';
$routes = json_decode(file_get_contents($file), true);
if (!is_array($routes)) {
  echo json_encode(['ok' => false, 'error' => 'routes.json corrupt']);
  exit;
}

$found = false;

foreach ($routes as &$r) {
  if ((string)$r['id'] === (string)$data['id']) {
    $r['naam']      = $data['naam'];
    $r['coords']    = $data['coords'];
    $r['waypoints'] = $data['waypoints'];
    $found = true;
    break;
  }
}

if (!$found) {
  echo json_encode(['ok' => false, 'error' => 'Route niet gevonden']);
  exit;
}

file_put_contents($file, json_encode($routes, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true]);
