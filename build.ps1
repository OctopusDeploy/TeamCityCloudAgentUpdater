param(
    [string]$buildVersion,
    [string]$gitHubApiKey
)
$ErrorActionPreference = 'Stop'

function Publish-ToGitHub($versionNumber, $commitId, $preRelease, $artifact, $gitHubApiKey)
{
    $data = @{
       tag_name = [string]::Format("v{0}", $versionNumber);
       target_commitish = $commitId;
       name = [string]::Format("v{0}", $versionNumber);
       body = '';
       prerelease = $preRelease;
    }

    $auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($gitHubApiKey + ":x-oauth-basic"));

    $releaseParams = @{
       Uri = "https://api.github.com/repos/OctopusDeploy/TeamCityCloudAgentUpdater/releases";
       Method = 'POST';
       Headers = @{ Authorization = $auth; }
       ContentType = 'application/json';
       Body = ($data | ConvertTo-Json -Compress)
    }

    $result = Invoke-RestMethod @releaseParams
    $uploadUri = $result | Select-Object -ExpandProperty upload_url
    $uploadUri = $uploadUri -creplace '\{\?name,label\}'
    $uploadUri = $uploadUri + ("?name=$artifact".Replace('.\', ''))

    $params = @{
      Uri = $uploadUri;
      Method = 'POST';
      Headers = @{ Authorization = $auth; }
      ContentType = 'application/zip';
      InFile = $artifact
    }
    Invoke-RestMethod @params
}

Write-output "### Enabling TLS 1.2 support"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12, [System.Net.SecurityProtocolType]::Tls11, [System.Net.SecurityProtocolType]::Tls

Write-output "### Installing dependencies"
# npm clean-install (ci) is faster and more reliable for CI environments
# It requires package-lock.json and installs exactly what's in the lock file
npm clean-install
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm clean-install failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-output "### Running tests"
# Run tests with Jest's TeamCity reporter if in TeamCity, otherwise use default reporter
if ($env:TEAMCITY_VERSION) {
    Write-output "##teamcity[testSuiteStarted name='Jest Tests']"

    # Install jest-teamcity-reporter if not already installed
    if (!(Test-Path "node_modules/jest-teamcity-reporter")) {
        Write-output "### Installing jest-teamcity-reporter"
        npm install --save-dev jest-teamcity-reporter
    }

    # Run tests with TeamCity reporter
    npx jest --reporters=jest-teamcity-reporter --coverage
    $testExitCode = $LASTEXITCODE

    # Report coverage to TeamCity if available
    if (Test-Path "coverage/lcov.info") {
        Write-output "### Reporting code coverage to TeamCity"

        # Extract coverage metrics from lcov.info
        $lcovContent = Get-Content "coverage/lcov.info"

        # LF = Lines Found (total lines)
        $totalLines = $lcovContent |
            Select-String -Pattern "^LF:" |
            ForEach-Object { [int]$_.Line.Split(':')[1] } |
            Measure-Object -Sum |
            Select-Object -ExpandProperty Sum

        # LH = Lines Hit (covered lines)
        $coveredLines = $lcovContent |
            Select-String -Pattern "^LH:" |
            ForEach-Object { [int]$_.Line.Split(':')[1] } |
            Measure-Object -Sum |
            Select-Object -ExpandProperty Sum

        # Calculate percentage
        if ($totalLines -gt 0) {
            $coveragePercentage = [math]::Round(($coveredLines / $totalLines) * 100, 2)
            Write-output "Code coverage: $coveredLines/$totalLines lines ($coveragePercentage%)"

            # Report to TeamCity
            Write-output "##teamcity[buildStatisticValue key='CodeCoverageAbsLTotal' value='$totalLines']"
            Write-output "##teamcity[buildStatisticValue key='CodeCoverageAbsLCovered' value='$coveredLines']"
            Write-output "##teamcity[buildStatisticValue key='CodeCoverageL' value='$coveragePercentage']"
        }
    }

    Write-output "##teamcity[testSuiteFinished name='Jest Tests']"

    if ($testExitCode -ne 0) {
        Write-Error "Tests failed with exit code $testExitCode"
        exit $testExitCode
    }
} else {
    # Run tests normally when not in TeamCity
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Tests failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

Write-output "### Creating release archive"
Compress-Archive -Path (get-childitem) -DestinationPath ".\TeamCityCloudAgentUpdater.$buildVersion.zip"

$commitId = git rev-parse HEAD
Publish-ToGitHub -versionNumber $buildVersion `
                 -commitId $commitId `
                 -preRelease $false `
                 -artifact ".\TeamCityCloudAgentUpdater.$buildVersion.zip" `
                 -gitHubApiKey $gitHubApiKey
