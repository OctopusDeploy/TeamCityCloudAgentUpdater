'use strict';

const { Command } = require('commander');
const lib = require('./lib/index');

function createProgram() {
  const program = new Command();

  program
    .name('TeamCity Cloud Agent Updater')
    .description('Simple NodeJS app to update images for TeamCity Cloud Agents, via the 2017.1 API.')
    .version('1.0.0');

  program
    .command('update-cloud-profile', { isDefault: true })
    .requiredOption('--token <string>', 'A valid TeamCity user access token (requires TC 2019.1)')
    .requiredOption('--server <string>', 'The url of the TeamCity server, eg "http://teamcity.example.com"')
    .requiredOption('--image <string>', 'The AMI id (for AWS), or full url to the VHD / resource id of the managed image (for Azure)')
    .requiredOption('--cloudprofile <string>', 'The name of the TeamCity Cloud Profile to modify')
    .requiredOption('--agentprefix <string>', 'The agent prefix used in the Cloud Profile image that should be updated')
    .option('--dryrun', 'Output what changes the app would make, but dont actually make the changes')
    .action((options) => lib.updateCloudImage(options.server, "Bearer " + options.token, options.cloudprofile, options.agentprefix, options.image, options.dryrun));

  program
    .command('remove-disabled-agents')
    .requiredOption('--token <string>', 'A valid TeamCity user access token (requires TC 2019.1)')
    .requiredOption('--server <string>', 'The url of the TeamCity server, eg "http://teamcity.example.com"')
    .option('--dryrun', 'Output what changes the app would make, but dont actually make the changes')
    .action((options) => lib.removeDisabledAgents(options.server, "Bearer " + options.token, options.dryrun));

  return program;
}

function run(argv) {
  const program = createProgram();
  return program.parse(argv);
}

module.exports = {
  createProgram,
  run
};