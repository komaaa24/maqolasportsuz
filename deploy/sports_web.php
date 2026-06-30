<?php
declare(strict_types=1);

$target = 'http://127.0.0.1:9001/sports_web.php';
if (!empty($_SERVER['QUERY_STRING'])) {
    $target .= '?' . $_SERVER['QUERY_STRING'];
}

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => false,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 30,
]);

$body = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE) ?: 502;
$error = curl_error($ch);
curl_close($ch);

http_response_code($status);

if ($body === false) {
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Payment Web App is unavailable: ' . $error;
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
echo $body;
