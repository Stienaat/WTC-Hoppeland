<?php
session_start();
ini_set('display_errors', 1);
error_reporting(E_ALL);

require __DIR__ . '/vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;

// Toegang
if (
    empty($_SESSION['gebruiker']['email'])
    && empty($_SESSION['is_admin'])
) {
    header('Location: leden.html?msg=notknown');
    exit;
}

$dataDir = __DIR__ . '/data';
$bestand = $dataDir . '/leden.json';

if (!file_exists($bestand)) {
    file_put_contents($bestand, json_encode([]));
}

$leden = json_decode(file_get_contents($bestand), true);
if (!is_array($leden)) $leden = [];

// Nieuwe Excel
$spreadsheet = new Spreadsheet();
$sheet = $spreadsheet->getActiveSheet();

// Headers
$headers = [
    'Naam',
    'Email',
    'Telefoon',
    'Gemeente',
    'Adres'
];

$sheet->fromArray($headers, null, 'A1');

// Header-styling
$sheet->getStyle('A1:E1')->applyFromArray([
    'font' => [
        'bold' => true,
        'color' => ['rgb' => '000000']
    ],
    'fill' => [
        'fillType' => Fill::FILL_SOLID,
        'startColor' => ['rgb' => 'e2e8f0']
    ],
    'alignment' => [
        'horizontal' => Alignment::HORIZONTAL_CENTER,
        'vertical' => Alignment::VERTICAL_CENTER
    ],
    'borders' => [
        'allBorders' => [
            'borderStyle' => Border::BORDER_THIN,
            'color' => ['rgb' => '000000']
        ]
    ]
]);

// Data
$row = 2;
foreach ($leden as $lid) {
    $sheet->fromArray([
        $lid['naam'] ?? '',
        $lid['email'] ?? '',
        $lid['telefoon'] ?? '',
        $lid['gemeente'] ?? '',
        $lid['adres'] ?? ''
    ], null, "A{$row}");
    $row++;
}

// Borders
$lastRow = $row - 1;
$sheet->getStyle("A1:E{$lastRow}")->applyFromArray([
    'borders' => [
        'allBorders' => [
            'borderStyle' => Border::BORDER_THIN,
            'color' => ['rgb' => 'CCCCCC']
        ]
    ]
]);

// Autofilter
$sheet->setAutoFilter("A1:E{$lastRow}");




// Auto width
foreach (range('A', 'E') as $col) {
    $sheet->getColumnDimension($col)->setAutoSize(true);
}

// Download
header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header('Content-Disposition: attachment; filename="leden.xlsx"');
header('Cache-Control: max-age=0');

$writer = new Xlsx($spreadsheet);
$writer->save('php://output');


exit;

