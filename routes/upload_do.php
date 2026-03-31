<?php
session_start();

/* =====================================================
   A. AUTH
===================================================== */
if (!isset($_SESSION['is_admin']) || $_SESSION['is_admin'] !== true) {
    http_response_code(403);
    exit('Geen toegang.');
}

file_put_contents(
  __DIR__ . '/debug_upload.txt',
  "\n=== UPLOAD ===\nPOST:\n" . print_r($_POST, true) .
  "\nFILES:\n" . print_r($_FILES, true),
  FILE_APPEND
);


/* =====================================================
   B. BASE URL (werkt lokaal + hosting)
===================================================== */
$scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
// bv: /WTWouter/routes  of  /routes

/* =====================================================
   C. HELPERS
===================================================== */
function jsonResponse(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function loadRoutes(string $file): array {
    if (!file_exists($file)) return [];
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? $data : [];
}

function saveRoutes(string $file, array $routes): void {
    file_put_contents(
        $file,
        json_encode($routes, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );
}

/* =====================================================
   D. PADEN (filesystem)
===================================================== */
$routesFile = __DIR__ . '/routes.json';
$jaar       = date('Y');

/* =====================================================
   E. JSON SAVE (getekende route)
===================================================== */
if (
    $_SERVER['REQUEST_METHOD'] === 'POST' &&
    isset($_SERVER['CONTENT_TYPE']) &&
    str_contains($_SERVER['CONTENT_TYPE'], 'application/json')
) {
    $data = json_decode(file_get_contents('php://input'), true);

    if (!$data || empty($data['naam']) || empty($data['coords'])) {
        jsonResponse(['ok' => false, 'error' => 'Ongeldige route-data'], 400);
    }

    $routes = loadRoutes($routesFile);

    $routes[] = [
        'id'        => uniqid('drawn_', true),
        'type'      => 'catalog',
        'naam'      => trim($data['naam']),
        'jaar'      => intval($jaar),
        'groep'     => $data['groep'] ?? 'TEKEN',
        'coords'    => $data['coords'],
        'waypoints' => $data['waypoints'] ?? []
    ];

    saveRoutes($routesFile, $routes);
    jsonResponse(['ok' => true]);
}

/* =====================================================
   F. GPX UPLOAD (formulier)
===================================================== */
$naam    = trim($_POST['naam']   ?? '');
$groep   = trim($_POST['groep']  ?? '');
$afstand = trim($_POST['afstand'] ?? '');
$start   = trim($_POST['start']  ?? '');

if ($naam === '' || $groep === '' || $afstand === '' || $start === '') {
    exit('Ongeldige invoer.');
}

if (!isset($_FILES['gpxfile']) || $_FILES['gpxfile']['error'] !== UPLOAD_ERR_OK) {
    exit('Fout bij upload.');
}

$ext = strtolower(pathinfo($_FILES['gpxfile']['name'], PATHINFO_EXTENSION));
if ($ext !== 'gpx') {
    exit('Alleen GPX-bestanden zijn toegestaan.');
}

/* Bestandsnaam */
$id        = uniqid();
$cleanNaam = preg_replace('/[^a-z0-9\-]+/i', '-', strtolower($naam));
$filename  = "{$id}-{$cleanNaam}.gpx";

/* Doelmap */
$targetDir = __DIR__ . "/gpx/$jaar/$groep/";
if (!is_dir($targetDir) && !mkdir($targetDir, 0777, true)) {
    exit('Kon doelmap niet maken.');
}

if (!move_uploaded_file($_FILES['gpxfile']['tmp_name'], $targetDir . $filename)) {
    exit('Kon bestand niet verplaatsen.');
}

/* routes.json bijwerken */
$routes = loadRoutes($routesFile);

$routes[] = [
    'id'          => $id,
    'type'        => 'catalog',
    'naam'        => $naam,
    'jaar'        => intval($jaar),
    'groep'       => $groep,
    'afstand_km'  => $afstand,
    'start'       => $start,
    'bestand'     => $filename
];

saveRoutes($routesFile, $routes);

// =====================================================
// H. AJAX RESPONSE (voor upload via fetch)
// =====================================================
jsonResponse(['ok' => true]);


/* =====================================================
   G. REDIRECT TERUG NAAR KAART
===================================================== */

