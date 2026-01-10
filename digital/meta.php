<?php
header("Access-Control-Allow-Origin: *");

$url = $_GET['url'];
$html = file_get_contents($url);

function getMeta($html,$property){
  preg_match('/property="'.$property.'" content="([^"]+)"/i',$html,$m);
  return $m[1] ?? "";
}

echo json_encode([
  "title" => getMeta($html,"og:title"),
  "description" => getMeta($html,"og:description"),
  "image" => getMeta($html,"og:image"),
  "url" => $url
]);
