$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$ip = $null
try {
  $ip = (Get-NetIPAddress -InterfaceAlias 'WLAN' -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1).IPAddress
} catch { }
if (-not $ip) {
  $ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '26.*' } |
    Select-Object -First 1).IPAddress
}
if (-not $ip) { $ip = '127.0.0.1' }

Write-Host ''
Write-Host '知星已启动' -ForegroundColor Cyan
Write-Host "电脑访问: http://localhost:5174" -ForegroundColor Gray
Write-Host "手机访问: http://${ip}:5174" -ForegroundColor Green
Write-Host '手机需与电脑连同一个 Wi-Fi；关闭此窗口即停止服务。' -ForegroundColor DarkGray
Write-Host ''

npm run dev -- --host 0.0.0.0 --port 5174
