# ==== CONFIG ====
$workerUrl = "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev"
# read -hmac <secret> from command line (supports -hmac or --hmac)
$hmacSecret = $null
for ($i = 0; $i -lt $args.Count; $i++) {
    if ($args[$i] -eq '-hmac' -or $args[$i] -eq '--hmac') {
        if ($i + 1 -lt $args.Count) {
            $hmacSecret = $args[$i + 1]
            break
        }
    }
}
if (-not $hmacSecret) {
    Write-Host "Usage: .\worker_test.ps1 -hmac <secret>"
    exit 1
}

# ==== 1. Lesson JSON ====
$lesson = @{
    coursename     = "Python101"
    lessonname     = "Loops"
    userfirstname  = "Luca"
    content        = "Intro to loops in Python"
    knowledgelevel = "beginner"
    timestamp      = [int][double]::Parse((Get-Date -UFormat %s))  # epoch seconds
}
$json = $lesson | ConvertTo-Json -Compress

# ==== 2. Compress (gzip) ====
Add-Type -AssemblyName System.IO.Compression.FileSystem
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$ms = New-Object System.IO.MemoryStream
$gzip = New-Object System.IO.Compression.GzipStream($ms, [IO.Compression.CompressionMode]::Compress)
$gzip.Write($bytes, 0, $bytes.Length)
$gzip.Close()
$compressed = $ms.ToArray()
$ms.Close()

# ==== 3. Encode Base64 ====
$encoded = [Convert]::ToBase64String($compressed)

# ==== 4. Compute HMAC (hex string) ====
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($hmacSecret)
$hashBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($encoded))
$sig = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })

# ==== 5. Build URL and test ====
$url = "$workerUrl?data=$([Uri]::EscapeDataString($encoded))&sig=$sig"
Write-Host "`n➡️  Testing worker URL:`n$url`n"

$response = Invoke-RestMethod -Uri $url -Method GET -ErrorAction Stop
Write-Host "✅ Worker response:"
$response | ConvertTo-Json -Depth 5
