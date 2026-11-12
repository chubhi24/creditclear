# Builds the React app and publishes it to the CloudFront-hosted site.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File infra\scripts\deploy-site.ps1
# Needs the stack deployed first (sam deploy) and frontend\.env pointing at the AWS API.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$region = "us-east-1"

function Get-Output($key) {
  aws cloudformation describe-stacks --stack-name creditclear --region $region `
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" --output text
}
$bucket = Get-Output "SiteBucketName"
$distribution = Get-Output "SiteDistributionId"
$url = Get-Output "SiteUrl"

Push-Location (Join-Path $root "frontend")
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Build failed" }

  # Hashed files (assets/*) never change once published, so browsers may cache them for a year.
  aws s3 sync dist "s3://$bucket" --delete --region $region --exclude "index.html" `
    --cache-control "public,max-age=31536000,immutable"
  # index.html points at the current hashed files, so it must always be re-checked.
  aws s3 cp dist/index.html "s3://$bucket/index.html" --region $region `
    --cache-control "no-cache" --content-type "text/html; charset=utf-8"
  if ($LASTEXITCODE -ne 0) { throw "Upload failed" }

  aws cloudfront create-invalidation --distribution-id $distribution --paths "/index.html" "/" --query "Invalidation.Id" --output text | Out-Null
  Write-Host "Published: $url"
} finally {
  Pop-Location
}
