# Dugnad+ File Cleanup Script
# Safe execution with preview mode

$rootPath = "C:\Users\esesol\OneDrive - Innlandet fylkeskommune\Documents\Dugnad+\dugnadplus"

Write-Host "=== DUGNAD+ FILE CLEANUP SCRIPT ===" -ForegroundColor Cyan
Write-Host "Root folder: $rootPath" -ForegroundColor Yellow
Write-Host ""

# Step 1: Scan current files
Write-Host "Step 1: Scanning current files..." -ForegroundColor Green
$allFiles = Get-ChildItem -Path $rootPath -File -Recurse
Write-Host "Found $($allFiles.Count) files" -ForegroundColor Yellow
Write-Host ""

# Step 2: Categorize files
Write-Host "Step 2: Categorizing files..." -ForegroundColor Green

$categories = @{
    "code" = @("*.js", "*.jsx", "*.ts", "*.tsx", "*.html", "*.css", "*.vue")
    "docs" = @("*.md", "*.pdf", "*.docx", "*.txt", "*.doc")
    "config" = @("*.json", "*.env", "*.yml", "*.yaml", "*.toml", "*.xml")
    "images" = @("*.png", "*.jpg", "*.jpeg", "*.svg", "*.gif", "*.webp", "*.ico")
    "data" = @("*.csv", "*.xlsx", "*.xls", "*.sql")
    "archive" = @("*old*", "*backup*", "*copy*", "*-v[0-9]*")
}

foreach ($category in $categories.Keys) {
    $patterns = $categories[$category]
    $matchedFiles = $allFiles | Where-Object { 
        $file = $_
        $patterns | Where-Object { $file.Name -like $_ } | Select-Object -First 1
    }
    
    if ($matchedFiles) {
        Write-Host "  /$category - $($matchedFiles.Count) files" -ForegroundColor Cyan
        $matchedFiles | ForEach-Object { Write-Host "    - $($_.Name)" -ForegroundColor Gray }
    }
}

Write-Host ""

# Step 3: Preview proposed structure
Write-Host "Step 3: Proposed folder structure:" -ForegroundColor Green
Write-Host "  dugnadplus/" -ForegroundColor Cyan
Write-Host "    ├── code/          (JavaScript, HTML, CSS files)" -ForegroundColor Gray
Write-Host "    ├── docs/          (Documentation, PDFs)" -ForegroundColor Gray
Write-Host "    ├── config/        (Configuration files)" -ForegroundColor Gray
Write-Host "    ├── images/        (Images, icons)" -ForegroundColor Gray
Write-Host "    ├── data/          (CSV, Excel, SQL files)" -ForegroundColor Gray
Write-Host "    └── archive/       (Old versions, backups)" -ForegroundColor Gray
Write-Host ""

# Step 4: Ask for confirmation
Write-Host "=== PREVIEW MODE ===" -ForegroundColor Yellow
Write-Host "No files have been moved yet!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Do you want to proceed with organizing? (Y/N): " -ForegroundColor Green -NoNewline
$confirmation = Read-Host

if ($confirmation -eq "Y" -or $confirmation -eq "y") {
    Write-Host ""
    Write-Host "Step 5: Creating folder structure..." -ForegroundColor Green
    
    # Create folders
    foreach ($category in $categories.Keys) {
        $folderPath = Join-Path $rootPath $category
        if (-not (Test-Path $folderPath)) {
            New-Item -Path $folderPath -ItemType Directory -Force | Out-Null
            Write-Host "  Created: /$category" -ForegroundColor Cyan
        }
    }
    
    Write-Host ""
    Write-Host "Step 6: Moving files..." -ForegroundColor Green
    
    $movedCount = 0
    foreach ($category in $categories.Keys) {
        $patterns = $categories[$category]
        $targetFolder = Join-Path $rootPath $category
        
        $filesToMove = $allFiles | Where-Object { 
            $file = $_
            # Skip if already in target folder
            if ($file.DirectoryName -eq $targetFolder) { return $false }
            # Check if matches pattern
            $patterns | Where-Object { $file.Name -like $_ } | Select-Object -First 1
        }
        
        foreach ($file in $filesToMove) {
            $destination = Join-Path $targetFolder $file.Name
            
            # Handle duplicates
            if (Test-Path $destination) {
                $newName = "$($file.BaseName)_$(Get-Date -Format 'yyyyMMdd')$($file.Extension)"
                $destination = Join-Path $targetFolder $newName
                Write-Host "  Renamed duplicate: $($file.Name) -> $newName" -ForegroundColor Yellow
            }
            
            Move-Item -Path $file.FullName -Destination $destination -Force
            Write-Host "  Moved: $($file.Name) -> /$category/" -ForegroundColor Gray
            $movedCount++
        }
    }
    
    Write-Host ""
    Write-Host "=== CLEANUP COMPLETE ===" -ForegroundColor Green
    Write-Host "Moved $movedCount files" -ForegroundColor Cyan
    Write-Host ""
    
    # Step 7: Create inventory
    Write-Host "Step 7: Creating inventory file..." -ForegroundColor Green
    $inventoryPath = Join-Path $rootPath "FILE_INVENTORY.txt"
    
    $inventory = @"
DUGNAD+ FILE INVENTORY
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Location: $rootPath

==============================================

"@
    
    foreach ($category in $categories.Keys) {
        $folderPath = Join-Path $rootPath $category
        if (Test-Path $folderPath) {
            $files = Get-ChildItem -Path $folderPath -File
            $inventory += "`n/$category/ ($($files.Count) files)`n"
            $inventory += "----------------------------------------`n"
            foreach ($file in $files) {
                $inventory += "  - $($file.Name) ($([math]::Round($file.Length/1KB, 2)) KB)`n"
            }
        }
    }
    
    $inventory | Out-File -FilePath $inventoryPath -Encoding UTF8
    Write-Host "  Created: FILE_INVENTORY.txt" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "All done! Your Dugnad+ folder is now organized." -ForegroundColor Green
    
} else {
    Write-Host ""
    Write-Host "Cleanup cancelled. No files were moved." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
