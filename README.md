# TeamCityCloudAgentUpdater

When a new TeamCity agent image is built (e.g., via [packer](packer.io)), you need to tell TeamCity to start using it.

This is a simple NodeJS app that can:
1. Update TeamCity Cloud Agents images and disable any agents that are running that are based on the old image
2. Remove any agents that were disabled during update that are no longer running a build

## Usage

When you have a new agent, update the cloud profile:
```bash
node index.js update-cloud-profile --token XXXXX --server https://teamcity.example.com --image ami-XXXXXXX --cloudprofile "AWS Agents" --agentprefix "Ubuntu" [--dryrun]
```

To remove any agents that were disabled as part of the update, and are no longer running a build (run on a schedule):
```bash
node index.js remove-disabled-agents --token XXXXX --server https://teamcity.example.com [--dryrun]
```

The `--dryrun` flag allows you to check what actions the script would have taken without any real modifications.

## Requirements

- Node.js >= 22.0.0
- npm >= 11.0.0
- TeamCity `2019.1` or newer (for user access tokens)

## Development

### Installation
```bash
npm install
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Project Structure
```
.
├── index.js                 # Entry point
├── cli.js                   # CLI command definitions
├── lib/
│   ├── agents.js           # Agent management operations
│   ├── cloud-profiles.js   # Cloud profile management
│   └── utils.js            # Utility functions
└── *.test.js               # Test files co-located with source
```

## License

This project is licensed under the Apache 2.0 license.
