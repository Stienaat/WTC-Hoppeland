import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

<?php
declare(strict_types=1);

/************************************************************
 * BOOTSTRAP
 ************************************************************/
session_start();
ini_set('display_errors', '0');
error_reporting(E_ALL);

/************************************************************
 * AJAX detectie
 ************************************************************/
function is_ajax(): bool {
  $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
  if (stripos($accept, 'application/json') !== false) return true;

  $xhr = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
  if (strcasecmp($xhr, 'XMLHttpRequest') === 0) return true;

  return false;
}

/************************************************************
 * JSON / redirect error handler
 ************************************************************/
function fail(string $msg): void {
  if (is_ajax()) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $q = http_build_query([
    'popup' => '1',
    'type'  => 'error',
    'msg'   => $msg,
  ]);
  header('Location: leden.html?' . $q);
  exit;
}

/************************************************************
 * JSON helpers
 ************************************************************/
function read_json(string $path, $default) {
  if (!file_exists($path)) return $default;
  $raw = file_get_contents($path);
  $j = json_decode($raw, true);
  return is_array($j) ? $j : $default;
}

function write_json(string $path, $data): void {
  file_put_contents(
    $path,
    json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
  );
}

/************************************************************
 * SESSION helper
 ************************************************************/
function loginAs(string $memberId, bool $isAdmin, array $userInfo): void {
  $_SESSION = [];
  $_SESSION['member_id'] = $memberId;
  $_SESSION['is_admin']  = $isAdmin;
  $_SESSION['gebruiker'] = $userInfo + [
    'id'  => $memberId,
    'rol' => $isAdmin ? 'admin' : 'member',
  ];
}

/************************************************************
 * DATA SETUP
 ************************************************************/
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) mkdir($dataDir, 0777, true);

/* leden */
$ledenFile = $dataDir . '/leden.json';
if (!file_exists($ledenFile)) write_json($ledenFile, []);
$leden = read_json($ledenFile, []);

/* admin config */
$adminFile = $dataDir . '/admin.json';
if (!file_exists($adminFile)) {
  write_json($adminFile, [
    'pin_hash' => password_hash('123456', PASSWORD_DEFAULT)
  ]);
}
$adminCfg = read_json($adminFile, []);
$adminPinHash = $adminCfg['pin_hash'] ?? '';

/************************************************************
 * Alleen POST toegestaan
 ************************************************************/
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  header('Location: leden.html');
  exit;
}

$actie = $_POST['actie'] ?? '';
if ($actie === '') fail('Geen actie opgegeven.');

/************************************************************
 * ADMIN LOGIN
 ************************************************************/
if ($actie === 'admin_login') {
  $pin = trim((string)($_POST['admin_pin'] ?? ''));

  if ($pin === '' || !$adminPinHash || !password_verify($pin, $adminPinHash)) {
    fail('Onjuiste admin PIN.');
  }

  loginAs('admin_1', true, [
    'email' => 'admin@wtc.local',
    'naam'  => 'Beheerder',
  ]);

  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
  exit;
}

/************************************************************
 * ADMIN PIN WIJZIGEN
 ************************************************************/
if ($actie === 'admin_change_pin') {
  if (empty($_SESSION['is_admin'])) {
    fail('Niet aangemeld als admin.');
  }

  $old = trim((string)($_POST['old_pin'] ?? ''));
  $new = trim((string)($_POST['new_pin'] ?? ''));

  if (strlen($old) !== 6 || strlen($new) !== 6) {
    fail('PIN moet exact 6 cijfers zijn.');
  }

  if (!$adminPinHash || !password_verify($old, $adminPinHash)) {
    fail('Huidige PIN is fout.');
  }

  $adminCfg['pin_hash'] = password_hash($new, PASSWORD_DEFAULT);
  write_json($adminFile, $adminCfg);

  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
  exit;
}

/************************************************************
 * REGISTRATIE
 ************************************************************/
if ($actie === 'registreer') {
	 $naam    = trim((string)($_POST['name'] ?? ''));
	$adres   = trim((string)($_POST['address'] ?? ''));
	$gemeente= trim((string)($_POST['city'] ?? ''));
	$telefoon= trim((string)($_POST['phone'] ?? ''));
	$email   = trim((string)($_POST['email'] ?? ''));
	$pass    = (string)($_POST['code'] ?? '');
	$pass2   = (string)($_POST['code_repeat'] ?? '');

  if (
  $naam === '' ||
  $adres === '' ||
  $gemeente === '' ||
  $telefoon === '' ||
  $email === '' ||
  $pass === '' ||
  $pass2 === ''
) {
  fail('Alle verplichte velden invullen.');
}

  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Ongeldig e-mailadres.');
  if ($pass !== $pass2) fail('Paswoorden komen niet overeen.');

  foreach ($leden as $l) {
    if (strcasecmp($l['email'], $email) === 0) {
      fail('Dit e-mailadres bestaat al.');
    }
  }

  $id = uniqid('lid_', true);
 $leden[] = [
  'id'         => $id,
  'naam'       => $naam,
  'adres'      => $adres,
  'gemeente'   => $gemeente,
  'telefoon'   => $telefoon,
  'email'      => $email,
  'wachtwoord' => password_hash($pass, PASSWORD_DEFAULT),
]; 

write_json($ledenFile, $leden);


  write_json($ledenFile, $leden);

	 loginAs($id, false, [
	  'naam'     => $naam,
	  'email'    => $email,
	  'adres'    => $adres,
	  'gemeente' => $gemeente,
	  'telefoon' => $telefoon
]);

  header('Location: leden-dashboard.php');
  exit;
}

/************************************************************
 * MEMBER LOGIN
 ************************************************************/
if ($actie === 'login') {
  $email = trim((string)($_POST['email'] ?? ''));
  $pass  = (string)($_POST['code'] ?? '');

  foreach ($leden as $lid) {
    if (strcasecmp($lid['email'], $email) === 0 &&
        password_verify($pass, $lid['wachtwoord'] ?? '')) {

      loginAs($lid['id'], false, [
        'email' => $lid['email'],
        'name' => $lid['naam'] ?? '',
		'phone' => $lid['telefoon'] ?? '',
      ]);

      header('Location: leden-dashboard.php');
      exit;
    }
  }

  fail('Onjuiste login.');
}

fail('Onbekende actie.');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static("public"));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CONTACT FORM
app.post("/api/contact", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      street,
      zip,
      city,
      message,
      consent
    } = req.body;

    if (!name || !message) {
      return res.json({ ok: false, error: "name/message required" });
    }

    const { data, error } = await supabase
      .from("forms")
      .insert([
        {
          name,
          email: email?.toLowerCase() || "",
          phone,
          street,
          zip,
          city,
          msg: message,
          consent: consent === true
        }
      ])
      .select();

    if (error) {
      console.error(error);
      return res.json({ ok: false, error: "Database insert failed" });
    }

    return res.json({
      ok: true,
      txt: `
${name}
${email || ""}
${phone || ""}
${street || ""}
${zip || ""}
${city || ""}
${message}
${new Date().toISOString().slice(0, 16).replace("T", " ")}
      `.trim()
    });
  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Server error" });
  }
});

// NOTICE ROUTE
app.get("/notice", (req, res) => {
  const filePath = path.join(__dirname, "data", "notice.md");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      return res.status(500).send("Kon mededelingen niet laden.");
    }
    res.send(data);
  });
});


// LOGIN ROUTE
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ ok: false, error: "Email en wachtwoord vereist" });
    }

    // Pad naar leden.json
    const ledenPath = path.join(__dirname, "data", "leden.json");

    // JSON inlezen
    const raw = fs.readFileSync(ledenPath, "utf8");
    const leden = JSON.parse(raw);

    // Lid zoeken op email (case-insensitive)
    const lid = leden.find(
      (l) => l.email.toLowerCase() === email.toLowerCase()
    );

    if (!lid) {
      return res.json({ ok: false, error: "Onbekende gebruiker" });
    }

    // Wachtwoord controleren
    const match = await bcrypt.compare(password, lid.wachtwoord);

    if (!match) {
      return res.json({ ok: false, error: "Fout wachtwoord" });
    }

    // Login OK
    return res.json({
      ok: true,
      naam: lid.naam,
      id: lid.id
    });

  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Serverfout" });
  }
});

// START SERVER
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server draait op poort ${PORT}`);
});
