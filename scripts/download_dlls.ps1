# 下载 PDFium 和 ONNX Runtime DLL
# 在 PowerShell 中运行: .\scripts\download_dlls.ps1

$ErrorActionPreference = "Stop"
$targetDir = "$PSScriptRoot\..\src-tauri"

Write-Host "=" * 60
Write-Host "下载 PDFium 和 ONNX Runtime DLL"
Write-Host "=" * 60

# 创建临时目录
$tempDir = "$targetDir\temp_dlls"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

# 1. 下载 PDFium
Write-Host "`n下载 PDFium..."
# 使用 paulocoutinhox/pdfium-lib 官方预编译版本
$pdfiumUrl = "https://github.com/paulocoutinhox/pdfium-lib/releases/download/6666/pdfium-windows-x64.tgz"
$pdfiumFile = "$tempDir\pdfium.tgz"

if (-Not (Test-Path "$targetDir\pdfium.dll")) {
    Write-Host "  从 GitHub 下载..."
    try {
        Invoke-WebRequest -Uri $pdfiumUrl -OutFile $pdfiumFile
        
        # 解压 tgz
        Write-Host "  解压中..."
        tar -xzf $pdfiumFile -C $tempDir
        
        # 查找 pdfium.dll
        $pdfiumDll = Get-ChildItem -Path $tempDir -Recurse -Filter "pdfium.dll" | Select-Object -First 1
        if ($pdfiumDll) {
            Copy-Item $pdfiumDll.FullName "$targetDir\pdfium.dll"
            Write-Host "  pdfium.dll -> $targetDir\pdfium.dll"
        } else {
            Write-Host "  警告: 未找到 pdfium.dll"
            Write-Host "  请手动下载: https://github.com/paulocoutinhox/pdfium-lib/releases"
        }
    } catch {
        Write-Host "  下载失败: $_"
        Write-Host "  请手动下载: https://github.com/paulocoutinhox/pdfium-lib/releases"
    }
} else {
    Write-Host "  pdfium.dll 已存在"
}

# 2. 下载 ONNX Runtime
Write-Host "`n下载 ONNX Runtime..."
$ortUrl = "https://github.com/microsoft/onnxruntime/releases/download/v1.19.2/onnxruntime-win-x64-1.19.2.zip"
$ortZip = "$tempDir\onnxruntime.zip"

if (-Not (Test-Path "$targetDir\onnxruntime.dll")) {
    Invoke-WebRequest -Uri $ortUrl -OutFile $ortZip
    Expand-Archive -Path $ortZip -DestinationPath $tempDir -Force
    
    # 查找 onnxruntime.dll
    $ortDll = Get-ChildItem -Path $tempDir -Recurse -Filter "onnxruntime.dll" | Select-Object -First 1
    if ($ortDll) {
        Copy-Item $ortDll.FullName "$targetDir\onnxruntime.dll"
        Write-Host "  onnxruntime.dll -> $targetDir\onnxruntime.dll"
    } else {
        Write-Host "  警告: 未找到 onnxruntime.dll，请手动下载"
    }
} else {
    Write-Host "  onnxruntime.dll 已存在"
}

# 清理临时文件
Write-Host "`n清理临时文件..."
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "  完成!"

# 总结
Write-Host "`n" + ("=" * 60)
Write-Host "DLL 文件:"
Write-Host "=" * 60
Get-ChildItem "$targetDir\*.dll" | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 1)
    Write-Host "  $($_.Name): $size MB"
}

Write-Host "`n完成! DLL 已放置在 $targetDir"
