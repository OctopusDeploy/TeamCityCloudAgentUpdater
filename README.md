# TeamCityCloudAgentUpdater

When building a new teamcity agent image (e.g., via [packer](packer.io)), once it's built, you need to tell TeamCity to start using it.

This is a simple NodeJS app that can:
1. updates TeamCity Cloud Agents images and disable any agents that are running that are based on the old image
2. remove any agents that were disabled during update that are no longer running a build

## Usage

To update a cloud profile (whenever you have a new agent):
```
node index.js [update-cloud-image] --token XXXXX --server https://teamcity.example.com --image ami-XXXXXXX --cloudprofile "AWS Agents" --agentprefix "Ubuntu" [--dryrun]
```

To remove any agents that were disabled as part of the update, and are no longer running a build (run on a schedule):
```
node index.js remove-disabled-agents --token XXXXX --server https://teamcity.example.com [--dryrun]
```

The `--dryrun` flag allows you to check what actions the script would have taken with out any real modifications.

## Requiremens

This app uses features (user access tokens) that require TeamCity `2019.1` or newer.

## License

This project is licensed under the Apache 2.0 license.
