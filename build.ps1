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

Write-output "### Running npm operations in Docker container"

# Use Node 22 Alpine image (smaller and matches package.json requirement)
$nodeImage = "node:22-alpine"
$workDir = "/app"

# Mount current directory to container and run npm/test commands
Write-output "### Installing dependencies in Docker"
docker run --rm `
    -v "${PWD}:${workDir}" `
    -w $workDir `
    $nodeImage `
    sh -c "npm install -g npm@latest && npm clean-install"

if ($LASTEXITCODE -ne 0) {
    Write-Error "npm clean-install failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-output "### Running tests in Docker"
# Run tests with Jest's TeamCity reporter if in TeamCity, otherwise use default reporter
if ($env:TEAMCITY_VERSION) {
    Write-output "##teamcity[testSuiteStarted name='Jest Tests']"

    # Run tests with coverage (reporter auto-selected by jest.config.js)
    docker run --rm `
        -v "${PWD}:${workDir}" `
        -w $workDir `
        -e TEAMCITY_VERSION=$env:TEAMCITY_VERSION `
        $nodeImage `
        sh -c "npm install -g npm@latest && npx jest --coverage --ci"

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
    docker run --rm `
        -v "${PWD}:${workDir}" `
        -w $workDir `
        $nodeImage `
        sh -c "npm test"

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
