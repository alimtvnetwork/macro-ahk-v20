<#
.SYNOPSIS
    Help text display for the build script (-h flag).

.DESCRIPTION
    Prints usage, flags, examples, detected profiles, and configuration.
#>

<#
.SYNOPSIS
    Displays the full help text and exits with code 0.
#>
function Show-Help {
    Write-Host ""
    Write-Host "$($script:ProjectName) - Build & Deploy Script" -ForegroundColor Cyan
    Write-Host ("=" * ($script:ProjectName.Length + 24)) -ForegroundColor Cyan
    Write-Host ""
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  .\run.ps1 [flags]"
    Write-Host ""
    Write-Host "FLAGS:" -ForegroundColor Yellow
    Write-Host "  -h,  -help         Show this help message and exit"
    Write-Host "  -b,  -buildonly    Build extension only, don't deploy"
    Write-Host "  -s,  -skipbuild    Skip build, deploy existing dist/"
    Write-Host "  -p,  -skippull     Skip git pull step"
    Write-Host "  -f,  -force        Clean build: remove dist, caches, node_modules"
    Write-Host "  -i,  -installonly  Install/update dependencies only"
    Write-Host "  -r,  -rebuild      Complete clean reinstall (combines -f + -i)"
    Write-Host "  -d,  -deploy       Deploy extension to browser profile (dev mode: inline source maps)"
    Write-Host "  -pr, -profile      Chrome/Edge profile name (default: '$($script:DefaultProfile)')"
    Write-Host "  -e,  -browser      Browser: 'chrome' or 'edge' (default: 'chrome')"
    Write-Host "  -w,  -watch        Watch mode -- rebuild on file changes"
    Write-Host "  -dm, -directmode   Direct mode -- load from repo dist/ (no copy)"
    Write-Host "  -pf, -preflight    Preflight check -- verify toolchain readiness"
    Write-Host "  -v,  -verbose      Show detailed debug output"
    Write-Host "  -dl, -downloadchrome  Download Chrome for Testing + save to config"
    Write-Host "  -k,  -kill         Kill the target browser before deploy for cold start"
    Write-Host "  -nsm,-nosourcemap  Skip sourcemap generation for faster builds"
    Write-Host "  -q,  -quick        Quick mode -- skip pull + no sourcemaps (-p + -nsm)"
    Write-Host ""
    Write-Host "EXAMPLES:" -ForegroundColor Yellow
    Write-Host "  .\run.ps1                         # Full build"
    Write-Host "  .\run.ps1 -d                      # Build + deploy to default profile"
    Write-Host "  .\run.ps1 -d -pr 'Profile 1'      # Deploy to specific profile"
    Write-Host "  .\run.ps1 -d -e edge               # Deploy to Microsoft Edge"
    Write-Host "  .\run.ps1 -s -d                    # Deploy existing build (skip build)"
    Write-Host "  .\run.ps1 -f                       # Clean rebuild"
    Write-Host "  .\run.ps1 -r                       # Full clean + reinstall + build"
    Write-Host "  .\run.ps1 -w                       # Watch mode"
    Write-Host "  .\run.ps1 -i                       # Install dependencies only"
    Write-Host "  .\run.ps1 -pf                      # Preflight check only"
    Write-Host ""
    Write-Host "PROFILES:" -ForegroundColor Yellow
    $profiles = Get-AvailableProfiles
    if ($profiles.Count -gt 0) {
        foreach ($p in $profiles) {
            Write-Host "  $($p.Folder) -> $($p.Name)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  (no profiles detected)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "CONFIGURATION:" -ForegroundColor Yellow
    Write-Host "  Config file: $($script:ConfigPath)"
    Write-Host "  Project: $($script:ProjectName)"
    Write-Host "  Extension: $($script:ExtensionDir)"
    Write-Host ""
}
