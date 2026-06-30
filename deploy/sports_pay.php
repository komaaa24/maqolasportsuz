<?php
declare(strict_types=1);

$target = 'http://127.0.0.1:9001/sports_pay.php';
$body = file_get_contents('php://input');

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => false,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 60,
]);

$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE) ?: 502;
$error = curl_error($ch);
curl_close($ch);

http_response_code($status);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($response === false) {
    echo json_encode([
        'ok' => false,
        'error' => 'WEB_APP_UNAVAILABLE',
        'message' => 'Payment Web App is unavailable: ' . $error,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo $response;
